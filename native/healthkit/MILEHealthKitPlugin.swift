import Foundation
import Security
import HealthKit
import Capacitor

// Read-only HealthKit prototype. Only opaque checkpoints use local Keychain persistence.
@objc(MILEHealthKitPlugin)
public class MILEHealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MILEHealthKitPlugin"
    public let jsName = "MILEHealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReadAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readWorkouts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readWorkoutPage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkpointGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkpointSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkpointRemove", returnType: CAPPluginReturnPromise)
    ]
    private let store = HKHealthStore()
    private var requestedThisSession = false

    @objc func availability(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestReadAccess(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit unavailable"); return
        }
        let read: Set<HKObjectType> = [HKObjectType.workoutType()]
        store.requestAuthorization(toShare: [], read: read) { [weak self] success, error in
            DispatchQueue.main.async {
                guard error == nil, success else {
                    call.reject("HealthKit authorization request did not complete"); return
                }
                self?.requestedThisSession = true
                // Completion does not imply permission to read every requested type.
                call.resolve(["requestCompleted": true])
            }
        }
    }

    @objc func readWorkouts(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), requestedThisSession else {
            call.reject("Request HealthKit access first"); return
        }
        let days = call.getInt("days") ?? 7
        guard (1...30).contains(days) else {
            call.reject("Days must be between 1 and 30"); return
        }
        let end = Date()
        let start = end.addingTimeInterval(-Double(days) * 86400)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate,
                                  limit: 501, sortDescriptors: [sort]) { _, samples, error in
            guard error == nil else { call.reject("HealthKit workout query failed"); return }
            let workouts = (samples as? [HKWorkout]) ?? []
            let formatter = ISO8601DateFormatter()
            let records: [[String: Any]] = workouts.prefix(500).map { workout in
                var row: [String: Any] = [
                    "provider": "apple_health",
                    "providerId": workout.uuid.uuidString,
                    "activityType": Int(workout.workoutActivityType.rawValue),
                    "startAt": formatter.string(from: workout.startDate),
                    "endAt": formatter.string(from: workout.endDate),
                    "durationSeconds": workout.duration
                ]
                if let distance = workout.totalDistance?.doubleValue(for: .meter()) {
                    row["distanceMeters"] = distance
                }
                return row
            }
            call.resolve(["workouts": records, "truncated": workouts.count > 500])
        }
        store.execute(query)
    }
    // Bounded historical windows. An opaque HealthKit anchor is valid only for
    // the same device, workout type and exact date window.
    @objc func readWorkoutPage(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), requestedThisSession else {
            call.reject("Request HealthKit access first"); return
        }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        func parse(_ value: String) -> Date? { iso.date(from: value) ?? plain.date(from: value) }
        guard let from = call.getString("from"), let to = call.getString("to"),
              let start = parse(from), let end = parse(to),
              start < end, end.timeIntervalSince(start) <= 30 * 86400,
              end <= Date().addingTimeInterval(60) else {
            call.reject("Invalid historical window"); return
        }
        var anchor: HKQueryAnchor?
        if let cursor = call.getString("cursor") {
            guard cursor.count <= 8192,
                  let encoded = Data(base64Encoded: cursor),
                  let envelope = try? JSONDecoder().decode(WorkoutCursor.self, from: encoded),
                  envelope.from == from, envelope.to == to,
                  let decoded = try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: envelope.anchor)
            else { call.reject("Invalid historical cursor"); return }
            anchor = decoded
        }
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
            NSPredicate(format: "%K >= %@", HKPredicateKeyPathStartDate, start as NSDate),
            NSPredicate(format: "%K < %@", HKPredicateKeyPathStartDate, end as NSDate)
        ])
        let limit = 200
        let query = HKAnchoredObjectQuery(type: HKObjectType.workoutType(), predicate: predicate,
                                         anchor: anchor, limit: limit) { _, samples, deleted, next, error in
            guard error == nil, let next = next,
                  let data = try? NSKeyedArchiver.archivedData(withRootObject: next, requiringSecureCoding: true),
                  let packed = try? JSONEncoder().encode(WorkoutCursor(from: from, to: to, anchor: data))
            else { call.reject("Historical workout query failed"); return }
            let workouts = (samples as? [HKWorkout]) ?? []
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let records: [[String: Any]] = workouts.map { workout in
                var row: [String: Any] = [
                    "provider": "apple_health", "providerId": workout.uuid.uuidString,
                    "activityType": Int(workout.workoutActivityType.rawValue),
                    "startAt": formatter.string(from: workout.startDate),
                    "endAt": formatter.string(from: workout.endDate),
                    "durationSeconds": workout.duration
                ]
                switch workout.workoutActivityType {
                case .running: row["sport"] = "running"
                case .cycling: row["sport"] = "cycling"
                case .swimming: row["sport"] = "swimming"
                case .walking: row["sport"] = "walking"
                case .traditionalStrengthTraining, .functionalStrengthTraining: row["sport"] = "strength"
                default: break
                }
                if let distance = workout.totalDistance?.doubleValue(for: .meter()) {
                    row["distanceMeters"] = distance
                }
                return row
            }
            let removed = (deleted ?? []).map { $0.uuid.uuidString }
            // Continue until an empty page, not merely a short page.
            call.resolve(["workouts": records, "deletedProviderIds": removed,
                          "nextCursor": packed.base64EncodedString(),
                          "hasMore": !records.isEmpty || !removed.isEmpty])
        }
        store.execute(query)
    }
    private struct WorkoutCursor: Codable {
        let from: String
        let to: String
        let anchor: Data
    }

    // Dedicated Keychain namespace, device-only, never synchronized via iCloud.
    private func checkpointQuery(_ call: CAPPluginCall) -> [String: Any]? {
        guard let key = call.getString("key"), key.hasPrefix("mile.healthkit.v1:"), key.count <= 1024 else {
            call.reject("Invalid checkpoint key"); return nil
        }
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: "au.com.milefitness.healthkit.checkpoints",
                kSecAttrAccount as String: key,
                kSecAttrSynchronizable as String: false]
    }
    @objc func checkpointGet(_ call: CAPPluginCall) {
        guard var query = checkpointQuery(call) else { return }
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve(["value": NSNull()]); return }
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            call.reject("Checkpoint read failed"); return
        }
        call.resolve(["value": value])
    }
    @objc func checkpointSet(_ call: CAPPluginCall) {
        guard let query = checkpointQuery(call) else { return }
        guard let value = call.getString("value"), !value.isEmpty, value.utf8.count <= 8192 else {
            call.reject("Invalid checkpoint value"); return
        }
        let data = Data(value.utf8)
        var status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(item as CFDictionary, nil)
            if status == errSecDuplicateItem {
                status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
            }
        }
        guard status == errSecSuccess else { call.reject("Checkpoint write failed"); return }
        call.resolve()
    }
    @objc func checkpointRemove(_ call: CAPPluginCall) {
        guard let query = checkpointQuery(call) else { return }
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Checkpoint removal failed"); return
        }
        call.resolve()
    }

}

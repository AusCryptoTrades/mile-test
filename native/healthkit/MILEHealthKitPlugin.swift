import Foundation
import Security
import HealthKit
import Capacitor
import CoreLocation

// HealthKit is read-only. Routes and recovery observations never leave the device.
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
        CAPPluginMethod(name: "checkpointRemove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "installation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readRecovery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readWorkoutDetail", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "observeWorkouts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "changeCounter", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resumeReadAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleRun", returnType: CAPPluginReturnPromise)
    ]
    private let store = HKHealthStore()
    private var scheduleBusy = false
    private var requestedThisSession = false
    private var detailsThisSession = false
    private var workoutObserver: HKObserverQuery?
    private let pendingKey = "mile.healthkit.workout-change"
    private let observerKey = "mile.healthkit.workout-observer"

    public override func load() {
        if HKHealthStore.isHealthDataAvailable(), UserDefaults.standard.bool(forKey: observerKey) {
            installObserver()
        }
    }

    private func installObserver() {
        guard workoutObserver == nil else { return }
        let query = HKObserverQuery(sampleType: HKObjectType.workoutType(), predicate: nil) { _, finish, error in
            DispatchQueue.main.async {
                if error == nil {
                    let defaults = UserDefaults.standard
                    defaults.set(defaults.integer(forKey: self.pendingKey) + 1, forKey: self.pendingKey)
                    self.notifyListeners("workoutChanged", data: [:])
                }
                finish()
            }
        }
        workoutObserver = query
        store.execute(query)
    }

    @objc func observeWorkouts(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { call.reject("HealthKit unavailable"); return }
        let defaults = UserDefaults.standard
        if call.getBool("enabled") == true {
            guard requestedThisSession else { call.reject("Request HealthKit access first"); return }
            installObserver()
            store.enableBackgroundDelivery(for: HKObjectType.workoutType(), frequency: .hourly) { success, _ in
                defaults.set(success, forKey: self.observerKey)
                call.resolve(["enabled": success])
            }
        } else {
            if let query = workoutObserver { store.stop(query) }
            workoutObserver = nil
            defaults.removeObject(forKey: observerKey)
            if call.getBool("resetPermission") == true {
                requestedThisSession = false
                detailsThisSession = false
            }
            store.disableBackgroundDelivery(for: HKObjectType.workoutType()) { _, _ in call.resolve(["enabled": false]) }
        }
    }

    @objc func resumeReadAccess(_ call: CAPPluginCall) {
        let defaults = UserDefaults.standard
        guard HKHealthStore.isHealthDataAvailable(), defaults.bool(forKey: observerKey),
              let account = call.getString("account"), account == defaults.string(forKey: "mile.healthkit.installation-owner") else {
            call.resolve(["ready": false]); return
        }
        store.getRequestStatusForAuthorization(toShare: [], read: [HKObjectType.workoutType()]) { status, error in
            DispatchQueue.main.async {
                guard error == nil, status == .unnecessary else { call.resolve(["ready": false]); return }
                // A prior request means querying is permitted to proceed. It does not disclose a read grant.
                self.requestedThisSession = true
                call.resolve(["ready": true])
            }
        }
    }

    @objc func changeCounter(_ call: CAPPluginCall) {
        call.resolve(["counter": UserDefaults.standard.integer(forKey: pendingKey)])
    }

    @objc func installation(_ call: CAPPluginCall) {
        guard let account = call.getString("account"), UUID(uuidString: account) != nil,
              let epoch = call.getString("epoch"), UUID(uuidString: epoch) != nil,
              let from = call.getString("from"), from.count <= 32 else {
            call.reject("Invalid HealthKit installation scope"); return
        }
        let defaults = UserDefaults.standard
        let ownerKey = "mile.healthkit.installation-owner"
        if let existing = defaults.string(forKey: ownerKey), existing != account {
            call.reject("This iPhone’s HealthKit import is bound to a different MILE account"); return
        }
        let key = "mile.healthkit.installation"
        let id = defaults.string(forKey: key) ?? UUID().uuidString
        defaults.set(id, forKey: key)
        defaults.set(account, forKey: ownerKey)
        let epochKey = "mile.healthkit.import-epoch", startKey = "mile.healthkit.import-start"
        if defaults.string(forKey: epochKey) != epoch {
            defaults.set(epoch, forKey: epochKey)
            defaults.set(from, forKey: startKey)
        }
        call.resolve(["id": id, "from": defaults.string(forKey: startKey) ?? from])
    }

    private func quantityTypes() -> [HKQuantityType] {
        var identifiers: [HKQuantityTypeIdentifier] = [.heartRate, .restingHeartRate, .heartRateVariabilitySDNN, .vo2Max]
        if #available(iOS 16, *) {
            identifiers += [.runningStrideLength, .runningGroundContactTime, .runningVerticalOscillation, .runningPower]
        }
        return identifiers.compactMap { HKObjectType.quantityType(forIdentifier: $0) }
    }

    @objc func availability(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestReadAccess(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit unavailable"); return
        }
        let details = call.getBool("details") == true
        var read: Set<HKObjectType> = [HKObjectType.workoutType()]
        if details {
            read.formUnion(quantityTypes().map { $0 as HKObjectType })
            read.insert(HKSeriesType.workoutRoute())
            if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { read.insert(sleep) }
        }
        store.requestAuthorization(toShare: [], read: read) { [weak self] success, error in
            DispatchQueue.main.async {
                guard error == nil, success else {
                    call.reject("HealthKit authorization request did not complete"); return
                }
                self?.requestedThisSession = true
                self?.detailsThisSession = details
                // Completion does not imply permission to read every requested type.
                call.resolve(["requestCompleted": true])
            }
        }
    }

    private func distanceMeters(of workout: HKWorkout) -> Double? {
        if #available(iOS 16, *) {
            let identifier: HKQuantityTypeIdentifier?
            switch workout.workoutActivityType {
            case .running, .walking, .hiking: identifier = .distanceWalkingRunning
            case .cycling: identifier = .distanceCycling
            case .swimming: identifier = .distanceSwimming
            default: identifier = nil
            }
            if let identifier, let type = HKObjectType.quantityType(forIdentifier: identifier),
               let distance = workout.statistics(for: type)?.sumQuantity()?.doubleValue(for: .meter()) {
                return distance
            }
        }
        return workout.totalDistance?.doubleValue(for: .meter())
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
                if let distance = self.distanceMeters(of: workout) {
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
              end <= Date().addingTimeInterval(30 * 86400) else {
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
        let includeDetails = detailsThisSession && call.getBool("details") == true
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
                if let distance = self.distanceMeters(of: workout) {
                    row["distanceMeters"] = distance
                }
                if let id = workout.metadata?[HKMetadataKeyTimeZone] as? String, let zone = TimeZone(identifier: id) {
                    var calendar = Calendar(identifier: .gregorian)
                    calendar.timeZone = zone
                    let day = calendar.dateComponents([.year, .month, .day], from: workout.startDate)
                    if let y = day.year, let m = day.month, let d = day.day {
                        row["activityDay"] = String(format: "%04d-%02d-%02d", y, m, d)
                    }
                }
                if #available(iOS 16, *), includeDetails, let type = HKObjectType.quantityType(forIdentifier: .heartRate),
                   let average = workout.statistics(for: type)?.averageQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute())) {
                    row["averageHR"] = average
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

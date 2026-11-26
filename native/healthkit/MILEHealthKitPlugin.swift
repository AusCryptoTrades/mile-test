import Foundation
import HealthKit
import Capacitor

// Read-only prototype. No persistence, networking or automatic authorization.
@objc(MILEHealthKitPlugin)
public class MILEHealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MILEHealthKitPlugin"
    public let jsName = "MILEHealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReadAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readWorkouts", returnType: CAPPluginReturnPromise)
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
}

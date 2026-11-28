import Foundation
import HealthKit
import CoreLocation
import Capacitor

extension MILEHealthKitPlugin {
    private func workoutSample(_ id: UUID, completion: @escaping (HKWorkout?) -> Void) {
        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: HKQuery.predicateForObject(with: id),
                                  limit: 1, sortDescriptors: nil) { _, samples, _ in
            completion(samples?.first as? HKWorkout)
        }
        store.execute(query)
    }

    @objc func readWorkoutDetail(_ call: CAPPluginCall) {
        guard detailsThisSession, ownsHealthInstallation(call.getString("account")), let raw = call.getString("id"), let id = UUID(uuidString: raw) else {
            call.reject("Optional workout detail access is unavailable"); return
        }
        workoutSample(id) { workout in
            guard let workout else { call.resolve([:]); return }
            var result: [String: Any] = [:]
            let laps = (workout.workoutEvents ?? []).filter { $0.type == .lap && $0.dateInterval.duration > 0 }
            if !laps.isEmpty { result["lapSeconds"] = laps.prefix(200).map { $0.dateInterval.duration } }
            if #available(iOS 16, *), workout.workoutActivityType == .running {
                let metrics: [(String, HKQuantityTypeIdentifier, HKUnit)] = [
                    ("strideMeters", .runningStrideLength, .meter()),
                    ("groundContactMilliseconds", .runningGroundContactTime, .secondUnit(with: .milli)),
                    ("oscillationMeters", .runningVerticalOscillation, .meter()),
                    ("averagePowerWatts", .runningPower, .watt())
                ]
                for (key, identifier, unit) in metrics {
                    if let type = HKObjectType.quantityType(forIdentifier: identifier),
                       let reading = workout.statistics(for: type)?.averageQuantity()?.doubleValue(for: unit), reading.isFinite {
                        result[key] = reading
                    }
                }
            }
            let routeQuery = HKSampleQuery(sampleType: HKSeriesType.workoutRoute(), predicate: HKQuery.predicateForObjects(from: workout),
                                           limit: 2, sortDescriptors: nil) { _, samples, _ in
                // Multiple route segments are deliberately withheld until separately aligned.
                guard let routes = samples as? [HKWorkoutRoute], routes.count == 1 else { call.resolve(result); return }
                var coordinates: [[Double]] = []
                let query = HKWorkoutRouteQuery(route: routes[0]) { _, locations, done, error in
                    guard error == nil else { call.resolve(result); return }
                    if let locations {
                        coordinates.append(contentsOf: locations.prefix(max(0, 30000 - coordinates.count)).compactMap { location in
                            let coordinate = location.coordinate
                            return location.horizontalAccuracy >= 0 && CLLocationCoordinate2DIsValid(coordinate)
                                ? [coordinate.latitude, coordinate.longitude] : nil
                        })
                    }
                    if done {
                        let strideSize = max(1, Int(ceil(Double(coordinates.count) / 300)))
                        if coordinates.count >= 2 && coordinates.count < 30000 {
                            var route = Swift.stride(from: 0, to: coordinates.count, by: strideSize).map { coordinates[$0] }
                            if let last = coordinates.last, route.last != last { route.append(last) }
                            result["route"] = route
                        }
                        call.resolve(result)
                    }
                }
                self.store.execute(query)
            }
            self.store.execute(routeQuery)
        }
    }

    @objc func readRecovery(_ call: CAPPluginCall) {
        guard detailsThisSession, ownsHealthInstallation(call.getString("account")) else { call.reject("Optional recovery access is unavailable"); return }
        Task {
            let end = Date()
            let metrics: [(String, HKQuantityTypeIdentifier, HKUnit, Int)] = [
                ("restingHR", .restingHeartRate, HKUnit.count().unitDivided(by: .minute()), 7),
                ("hrvSDNN", .heartRateVariabilitySDNN, .secondUnit(with: .milli), 7),
                ("vo2Max", .vo2Max, HKUnit.literUnit(with: .milli).unitDivided(by: HKUnit.gramUnit(with: .kilo)).unitDivided(by: .minute()), 30)
            ]
            var result: [String: Any] = [:]
            let formatter = ISO8601DateFormatter()
            for (key, identifier, unit, days) in metrics {
                guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { continue }
                let predicate = HKQuery.predicateForSamples(withStart: end.addingTimeInterval(-Double(days)*86400),
                                                            end: end, options: .strictEndDate)
                let samples = await readSamples(type, predicate: predicate, limit: 1)
                if let sample = samples.first as? HKQuantitySample {
                    let value = sample.quantity.doubleValue(for: unit)
                    if value.isFinite && value > 0 { result[key] = ["value": value, "date": formatter.string(from: sample.endDate)] }
                }
            }
            if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
                let start = end.addingTimeInterval(-86400)
                let samples = await readSamples(sleep, predicate: HKQuery.predicateForSamples(withStart: start, end: end), limit: 501)
                // Only recorded asleep categories count; merge overlaps rather than summing each source.
                if samples.count <= 500 {
                    let ranges = samples.compactMap { sample -> DateInterval? in
                        guard let sample = sample as? HKCategorySample, [1,3,4,5].contains(sample.value) else { return nil }
                        let lower = max(sample.startDate, start), upper = min(sample.endDate, end)
                        return lower < upper ? DateInterval(start: lower, end: upper) : nil
                    }.sorted { $0.start < $1.start }
                    var merged: [DateInterval] = []
                    for range in ranges {
                        if let last = merged.last, range.start <= last.end {
                            merged[merged.count-1] = DateInterval(start: last.start, end: max(last.end, range.end))
                        } else { merged.append(range) }
                    }
                    if !merged.isEmpty { result["sleepMinutes24h"] = merged.reduce(0.0) { $0 + $1.duration } / 60 }
                }
            }
            call.resolve(result)
        }
    }

    private func readSamples(_ type: HKSampleType, predicate: NSPredicate, limit: Int) async -> [HKSample] {
        await withCheckedContinuation { continuation in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            store.execute(HKSampleQuery(sampleType: type, predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, samples, _ in
                continuation.resume(returning: samples ?? [])
            })
        }
    }
}

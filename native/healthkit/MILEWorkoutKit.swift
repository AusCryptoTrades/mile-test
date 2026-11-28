import Foundation
import HealthKit
import WorkoutKit
import CryptoKit
import Capacitor

extension MILEHealthKitPlugin {
    @objc func scheduleRun(_ call: CAPPluginCall) {
        guard #available(iOS 17, *), WorkoutScheduler.isSupported else {
            call.reject("Apple Watch scheduling is unavailable on this device"); return
        }
        guard let payload = call.getObject("workout"), let account = call.getString("account"),
              UUID(uuidString: account) != nil else { call.reject("Invalid workout"); return }
        Task { @MainActor in
            guard !scheduleBusy else { call.reject("A workout is already being scheduled"); return }
            scheduleBusy = true
            defer { scheduleBusy = false }
            do {
                let (plan, date) = try makeWatchPlan(payload, account: account)
                let scheduler = WorkoutScheduler.shared
                guard await scheduler.requestAuthorization() == .authorized else {
                    call.reject("Allow MILE to schedule workouts in Apple Watch settings"); return
                }
                let existing = await scheduler.scheduledWorkouts
                if existing.contains(where: { $0.plan.id == plan.id }) {
                    call.resolve(["status": "alreadyScheduled"]); return
                }
                await scheduler.schedule(plan, at: date)
                let verified = await scheduler.scheduledWorkouts.contains { $0.plan.id == plan.id }
                guard verified else { call.reject("Apple did not confirm the schedule. Check the Watch workout list."); return }
                call.resolve(["status": "scheduledOnPhone"])
            } catch {
                call.reject("This workout has an unsupported Apple Watch goal or alert")
            }
        }
    }

    @available(iOS 17, *)
    private func makeWatchPlan(_ payload: [String: Any], account: String) throws -> (WorkoutPlan, DateComponents) {
        enum Invalid: Error { case workout }
        guard let id = payload["id"] as? String, !id.isEmpty, id.utf8.count <= 128,
              let name = payload["name"] as? String, !name.isEmpty,
              let day = payload["date"] as? String, day.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil,
              let revision = payload["revision"] as? Int, revision > 0,
              let rows = payload["steps"] as? [[String: Any]], (1...50).contains(rows.count)
        else { throw Invalid.workout }
        let calendar = Calendar(identifier: .gregorian)
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: day), formatter.string(from: date) == day,
              date >= calendar.startOfDay(for: Date()),
              let last = calendar.date(byAdding: .day, value: 7, to: Date()), date <= last else { throw Invalid.workout }
        var warmup: WorkoutStep?, cooldown: WorkoutStep?, intervals: [IntervalStep] = []
        for (position, row) in rows.enumerated() {
            guard let duration = row["duration"] as? [String: Any], let kind = duration["kind"] as? String,
                  let intensity = row["intensity"] as? String else { throw Invalid.workout }
            let goal: WorkoutGoal
            if kind == "distance", let value = duration["meters"] as? Double, (1...200000).contains(value) {
                goal = .distance(value, .meters)
            } else if kind == "time", let value = duration["seconds"] as? Double, (1...86400).contains(value) {
                goal = .time(value, .seconds)
            } else { throw Invalid.workout }
            let target = row["target"] as? [String: Any] ?? [:]
            var alert: (any WorkoutAlert)?
            switch target["kind"] as? String ?? "open" {
            case "open": break
            case "pace":
                guard let fast = target["fastSecondsPerKm"] as? Double, let slow = target["slowSecondsPerKm"] as? Double,
                      fast >= 120, slow <= 1800, fast <= slow else { throw Invalid.workout }
                alert = SpeedRangeAlert.speed((1000/slow)...(1000/fast), unit: .metersPerSecond, metric: .current)
            case "heart_rate":
                guard let low = target["lowBpm"] as? Double, let high = target["highBpm"] as? Double,
                      low >= 30, high <= 250, low <= high else { throw Invalid.workout }
                alert = HeartRateRangeAlert.heartRate(low...high, unit: WorkoutAlertMetric.countPerMinute)
            default: throw Invalid.workout
            }
            if let alert, !CustomWorkout.supportsAlert(alert, activity: .running, location: .outdoor) { throw Invalid.workout }
            let step = WorkoutStep(goal: goal, alert: alert)
            if intensity == "warmup", position == 0 { warmup = step }
            else if intensity == "cooldown", position == rows.count-1 { cooldown = step }
            else if ["active", "interval", "rest", "recovery"].contains(intensity) {
                intervals.append(IntervalStep(["rest","recovery"].contains(intensity) ? .recovery : .work, step: step))
            } else { throw Invalid.workout }
        }
        guard !intervals.isEmpty else { throw Invalid.workout }
        let composition = CustomWorkout(activity: .running, location: .outdoor, displayName: String(name.prefix(60)),
            warmup: warmup, blocks: [IntervalBlock(steps: intervals, iterations: 1)], cooldown: cooldown)
        // One stable identity per account/session. Later revisions require removing the old schedule explicitly.
        let bytes = Array(SHA256.hash(data: Data((account + ":" + id).utf8)).prefix(16))
        let uuid = UUID(uuid: (bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5],bytes[6],bytes[7],
            bytes[8],bytes[9],bytes[10],bytes[11],bytes[12],bytes[13],bytes[14],bytes[15]))
        return (WorkoutPlan(.custom(composition), id: uuid), calendar.dateComponents([.year,.month,.day], from: date))
    }
}

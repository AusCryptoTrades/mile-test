# Controlled Garmin step check

The owner’s 11 km watch test already verified delivery, the displayed distance, live HR and the target-range gauge. This check covers step endings.

The sample FIT is a device-only test, with 150 m of distance and 135 seconds of fixed time. Use a compatible Garmin with a USB data connection or recreate the steps in Garmin Connect if the device does not expose a file drive. Nothing is published by the generator. The sample uses synthetic 85 and 130 bpm settings. Choose your own thresholds if the sample would require more than gentle movement.

1. To use different thresholds, run the following from the repo root after installing the locked Garmin SDK. Choose the **Above** threshold near an HR you can reach by gentle movement and the **Below** threshold you can cross during easy recovery. Record the exact values for the test.

   ```sh
   npm ci --prefix integrations/garmin
   node integrations/garmin/controlled-running-check.mjs mile-step-check.fit ABOVE_BPM BELOW_BPM
   ```

2. On a compatible device, connect by USB, copy the FIT to `Garmin/NewFiles`, and eject. In the Run activity, open Training, then My Workouts, then **MILE step check**. Review the seven steps before starting. [Garmin FIT workout instructions](https://developer.garmin.com/fit/cookbook/encoding-workout-files/)
3. Walk easily for a **60-second** warm-up. Check that it advances to **150 m**, the distance counts down, and the watch advances without a lap press. The next **45-second** step should also advance automatically.
4. Walk or stand for the **Below** step. Observe whether the watch advances and what HR it shows. Note an immediate advance separately if the threshold was already met. The next step should wait for a **lap press**. The **Above** step follows. Use gentle movement only. If either HR condition has not advanced after 90 seconds, press lap and record that outcome. Finish after the 30-second walk or stop the test if needed.
5. Record the watch model and firmware, each visible condition, and which steps advanced by distance, time, HR or lap. This local FIT checks device behaviour. A staging API publication receipt and the corresponding sanitised completed activity are needed separately to verify MILE matching and Garmin Connect’s partner payload.

Garmin FIT encodes one completion condition per step. The local test uses HR thresholds and relies on the athlete to press lap if needed. MILE Tracker uses the canonical recovery step’s timed alternative because it does not receive live HR. Garmin Connect sync accepts distance, time and lap. It preserves HR intensity targets on those steps and leaves HR-based step endings out of its release path until the authenticated partner contract is verified. Select **Timed recovery** in Build when preparing a programme for Garmin Connect sync. [FIT workout step specification](https://developer.garmin.com/fit/articles/file-types/workout.html)

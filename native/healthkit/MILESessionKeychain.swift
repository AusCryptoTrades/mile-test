import Foundation
import Security
import Capacitor

// Account tokens use a device-only Keychain item. They never share the HealthKit cursor namespace.
extension MILEHealthKitPlugin {
    private struct SessionRecord: Codable {
        let accessToken: String
        let refreshToken: String
        let userId: String
    }
    private var sessionQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "au.com.milefitness.native.account",
         kSecAttrAccount as String: "session",
         kSecAttrSynchronizable as String: false]
    }

    private func sessionRecord() -> (OSStatus, SessionRecord?) {
        var query = sessionQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        let record = (result as? Data).flatMap { try? JSONDecoder().decode(SessionRecord.self, from: $0) }
        return (status, record)
    }

    var secureSessionOwner: String? { sessionRecord().1?.userId }

    @objc func readSession(_ call: CAPPluginCall) {
        let (status, record) = sessionRecord()
        if status == errSecItemNotFound { call.resolve(["session": NSNull()]); return }
        guard status == errSecSuccess, let record else {
            call.reject("Could not read the secure session. Unlock this iPhone and try again."); return
        }
        call.resolve(["session": ["accessToken": record.accessToken, "refreshToken": record.refreshToken, "userId": record.userId]])
    }

    @objc func writeSession(_ call: CAPPluginCall) {
        guard let access = call.getString("accessToken"), (1...16384).contains(access.utf8.count),
              let refresh = call.getString("refreshToken"), (1...4096).contains(refresh.utf8.count),
              let owner = call.getString("userId"), UUID(uuidString: owner) != nil,
              let data = try? JSONEncoder().encode(SessionRecord(accessToken: access, refreshToken: refresh, userId: owner)) else {
            call.reject("Invalid secure session"); return
        }
        let query = sessionQuery
        let update = [kSecValueData as String: data] as CFDictionary
        var status = SecItemUpdate(query as CFDictionary, update)
        if status == errSecItemNotFound {
            var item = query
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(item as CFDictionary, nil)
            if status == errSecDuplicateItem { status = SecItemUpdate(query as CFDictionary, update) }
        }
        guard status == errSecSuccess else { call.reject("Could not save the secure session. Unlock this iPhone and try again."); return }
        call.resolve()
    }

    @objc func clearSession(_ call: CAPPluginCall) {
        let status = SecItemDelete(sessionQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Could not erase the secure session. Unlock this iPhone and sign out again."); return
        }
        call.resolve()
    }
}

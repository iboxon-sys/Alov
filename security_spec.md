# Alov.uz Firestore Security Specification (Phase 0 TDD)

## 1. Master Source of Truth & Relationship Mapping
- **Identity Root (`/users/{userId}`)**: Keyed strictly by `request.auth.uid`. Holds non-PII core profile attributes (`name`, `username`, `age`, `birthDate`, `gender`, `region`, `district`, `bio`, `avatar`, `banner`, `videoUrl`, `startGifUrl`, `isProfileCompleted`, `faceId`).
- **PII Subcollection (`/users/{userId}/private/info`)**: Isolates sensitive user PII (`email`, `phone`, `bankCard`, `telegramChatId`). Readable and writable ONLY by the owning `userId` (`isOwner(userId)`) or `isAdmin()`.
- **Wallet Subcollection (`/users/{userId}/wallet/main`)**: Holds `coins`, `diamonds`, `diamondProgress`, `pendingDiamondBatches`, `totalEarnedDiamonds`, `totalWithdrawnUzs`. Strictly bounded (`0 <= coins <= 100_000_000`, `pendingDiamondBatches.size() <= 50`). Never writable by another user.
- **Public Profiles (`/public_profiles/{userId}`)**: PII-free public mirror readable by authenticated users (`allow list` gated on `resource.data.isProfileCompleted == true` with zero `get()`/`exists()` calls).
- **User Settings (`/user_settings/{userId}`)**: Privacy (`locationVisibility`), `isLocationEnabled`, `startGifUrl`, `language`, `notificationsEnabled`. Owner or admin only.
- **Admin Allowlist (`/admins/{adminId}`)**: Trusted RBAC collection. Only bootstrapped verified admin (`zuhriddinoblaqul@gmail.com` with `email_verified == true`) can create/revoke admin records; regular users cannot read or self-assign `role: 'admin'`.
- **Chats & Messages (`/chats/{chatId}`, `/chats/{chatId}/messages/{messageId}`)**: Restricted strictly to the 2 bounded participants (`participants.size() == 2`). Subcollection messages verify parent chat membership via `get(...)` Master Gate.
- **Posts (`/posts/{postId}`)**: Authored by `authorUid == request.auth.uid`. Regular users can only edit caption/media/likes atomically; `authorUid` and `createdAt` are immutable.
- **Live Streams (`/live_streams/{streamId}` + `messages`, `viewers`, `signals`)**: Owned by `hostUid == request.auth.uid`. Terminal state (`status == 'ended'`) locks updates except by `isAdmin()`.

## 2. Core Data Invariants
1. No document may be created or updated with extra/shadow fields (`keys().hasAll(...) && keys().hasOnly(...)` on create; `affectedKeys().hasOnly(...)` on update).
2. `createdAt` MUST equal `request.time` on create and MUST remain immutable (`incoming().createdAt == existing().createdAt`) on update; `updatedAt` MUST equal `request.time`.
3. `uid` / `authorUid` / `hostUid` / `senderId` MUST strictly match `request.auth.uid` and remain immutable.
4. No `data:` base64 payloads or oversized strings (> `maxLength`) or oversized arrays may be written ("Denial of Wallet" protection).
5. `role: 'admin'` and `isAdmin: true` cannot be self-assigned by non-admin users during `create` or `update`.
6. Once `isProfileCompleted == true`, non-admin owners cannot alter `gender`, `birthDate`, or `age` directly via Firestore.
7. Bootstrapped admin recognition MUST require BOTH `request.auth.token.email == 'zuhriddinoblaqul@gmail.com'` AND `request.auth.token.email_verified == true`.
8. `allow list` queries MUST validate `resource.data` directly without `get()` or `exists()` lookups, and blanket `allow read: if true;` or `allow read: if isSignedIn();` on PII is forbidden.

## 3. The "Dirty Dozen" Attack Payloads (All Must Result in `PERMISSION_DENIED`)
1. **Privilege Escalation on Create (`Users`)**: Non-admin user tries to create `/users/{uid}` with `role: 'admin', isAdmin: true`.
2. **Shadow / Ghost Field Injection (`Users` Update)**: Owner sends update to `/users/{uid}` containing an undocumented shadow key `isVipVerified: true`.
3. **Spoofed Admin Email (`Admins` / `Users`)**: Attacker sends token with `email: 'zuhriddinoblaqul@gmail.com'` and `email_verified: false` to bypass admin gate.
4. **Cross-Tenant PII Read (`UserPrivateInfo`)**: Signed-in user `alice` attempts `get` on `/users/bob/private/info`.
5. **Completed Profile Gender/Age Tampering (`Users` Update)**: Completed user (`existing.isProfileCompleted == true`) tries to overwrite `gender` or `birthDate` via client update.
6. **Client Timestamp Forgery (`Users` Create)**: User creates `/users/{uid}` with a backdated `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`.
7. **ID Poisoning ("Denial of Wallet")**: Attacker attempts `create` at `/posts/{150_char_invalid_id}` or injects a 5KB string into `bio` (> 500 chars) or `data:image/png;base64,...` into `avatar`.
8. **Chat Participant Hijack (`Chats` Update)**: Non-participant `mallory` tries to add herself to `/chats/alice_bob` `participants` array or create a 50-member participant array.
9. **Chat Message Sender Spoofing (`ChatMessage` Create)**: Participant `bob` attempts to create a message in `/chats/alice_bob/messages/m1` with `senderId: 'alice'`.
10. **Terminal LiveStream Mutation (`LiveStream` Update)**: Non-admin host attempts to reopen or modify a stream whose `existing.status == 'ended'`.
11. **Unbounded Wallet Injection (`UserWallet` Update)**: User `alice` tries to write to `bob`'s wallet `/users/bob/wallet/main` or inject > `100_000_000` coins or 51 `pendingDiamondBatches`.
12. **Blanket Collection Scrape (`Users` / `Private` List)**: Signed-in user attempts an unfiltered `list` query across `/users` or `/users/{other}/private`.

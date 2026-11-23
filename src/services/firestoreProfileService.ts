import {
  auth,
  db,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  serverTimestamp,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  buildFirestoreProfilePatch,
  clampNonNegativeInt,
  clampNonNegativeNumber,
  FIRESTORE_LIMITS,
  splitUserToFirestoreDocs,
} from '../utils/firestoreSync';

function serializeTimestamp(val: unknown): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null && typeof (val as any).toDate === 'function') {
    try {
      return (val as any).toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isPermissionDeniedError(err: unknown): boolean {
  const code = String((err as any)?.code || '').toLowerCase();
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return code.includes('permission-denied') || msg.includes('missing or insufficient permissions');
}

function isOfflineOrUnavailableError(err: unknown): boolean {
  const code = String((err as any)?.code || '').toLowerCase();
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    code.includes('unavailable') ||
    code.includes('failed-precondition') ||
    msg.includes('client is offline') ||
    msg.includes('could not reach cloud firestore')
  );
}

async function getDocPreferServer(path: string, segments: [string, ...string[]]) {
  const ref = doc(db, segments[0], ...segments.slice(1));
  try {
    return await getDocFromServer(ref);
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      handleFirestoreError(err, OperationType.GET, path);
    }
    if (isOfflineOrUnavailableError(err)) {
      try {
        return await getDoc(ref);
      } catch (fallbackErr) {
        if (isPermissionDeniedError(fallbackErr)) {
          handleFirestoreError(fallbackErr, OperationType.GET, path);
        }
        return null;
      }
    }
    return null;
  }
}

export function canAccessFirestoreAsUser(uid?: string | null): boolean {
  if (!uid || !auth.currentUser) return false;
  return auth.currentUser.uid === uid;
}

/**
 * Loads an authenticated user's authoritative profile, private info, wallet, and settings
 * directly from Firestore BEFORE any client state or writes occur.
 * Returns null if the user does not exist in Firestore yet or if Firebase Auth is not active for this uid.
 */
export async function loadAuthoritativeUserFromFirestore(uid: string): Promise<Record<string, any> | null> {
  if (!canAccessFirestoreAsUser(uid)) return null;

  const userPath = `users/${uid}`;
  const userSnap = await getDocPreferServer(userPath, ['users', uid]);
  if (!userSnap || !userSnap.exists()) {
    return null;
  }

  const userData = userSnap.data() || {};
  const [privateSnap, walletSnap, settingsSnap] = await Promise.all([
    getDocPreferServer(`users/${uid}/private/info`, ['users', uid, 'private', 'info']),
    getDocPreferServer(`users/${uid}/wallet/main`, ['users', uid, 'wallet', 'main']),
    getDocPreferServer(`user_settings/${uid}`, ['user_settings', uid]),
  ]);

  const privateData = privateSnap?.exists() ? privateSnap.data() : {};
  const walletData = walletSnap?.exists() ? walletSnap.data() : {};
  const settingsData = settingsSnap?.exists() ? settingsSnap.data() : {};

  const createdAt = serializeTimestamp(userData.createdAt) || undefined;
  const updatedAt = serializeTimestamp(userData.updatedAt) || serializeTimestamp(walletData.updatedAt) || undefined;

  return {
    ...userData,
    ...privateData,
    ...settingsData,
    ...walletData,
    uid,
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

/**
 * Persists a user to Firestore ONLY creating initial defaults when the document does NOT exist yet.
 * If the document already exists in Firestore, merges only non-destructive changed fields and NEVER
 * resets coins, diamonds, createdAt, or edited profile data.
 */
export async function saveOrBackfillUserInFirestore(user: Record<string, any>): Promise<void> {
  const uid = String(user?.uid || '').trim();
  if (!canAccessFirestoreAsUser(uid)) return;

  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  let existingSnap: any = null;
  try {
    existingSnap = await getDoc(userRef);
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      handleFirestoreError(err, OperationType.GET, userPath);
    }
    return;
  }

  if (existingSnap && existingSnap.exists()) {
    // Document already exists — do NOT overwrite initial fields, coins, or createdAt!
    const existingData = existingSnap.data() || {};
    await updateExistingUserInFirestore(uid, user, existingData);
    return;
  }

  // First-time document creation in Firestore (preserve migrated wallet balance if present, else initial 100)
  const hasMigratedBalance = typeof user.coins === 'number' || typeof user.diamonds === 'number';
  const split = splitUserToFirestoreDocs(user, { isInitialCreate: !hasMigratedBalance });
  if (!split) return;

  const pubRef = doc(db, 'public_profiles', uid);
  const privRef = doc(db, 'users', uid, 'private', 'info');
  const walletRef = doc(db, 'users', uid, 'wallet', 'main');
  const settingsRef = doc(db, 'user_settings', uid);

  try {
    await setDoc(userRef, {
      ...split.userDoc,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      handleFirestoreError(err, OperationType.CREATE, userPath);
    }
    console.warn('Firestore user create fallback warning:', err);
    return;
  }

  await Promise.all([
    setDoc(
      pubRef,
      {
        ...split.publicProfileDoc,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => {
      if (isPermissionDeniedError(err)) handleFirestoreError(err, OperationType.WRITE, `public_profiles/${uid}`);
    }),
    setDoc(
      privRef,
      {
        ...split.privateInfoDoc,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => {
      if (isPermissionDeniedError(err)) handleFirestoreError(err, OperationType.WRITE, `users/${uid}/private/info`);
    }),
    setDoc(
      walletRef,
      {
        ...split.walletDoc,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => {
      if (isPermissionDeniedError(err)) handleFirestoreError(err, OperationType.WRITE, `users/${uid}/wallet/main`);
    }),
    setDoc(
      settingsRef,
      {
        ...split.settingsDoc,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((err) => {
      if (isPermissionDeniedError(err)) handleFirestoreError(err, OperationType.WRITE, `user_settings/${uid}`);
    }),
  ]);
}

/**
 * Updates ONLY changed profile/settings fields on an existing Firestore user document via merge/updateDoc.
 * Never writes default coins, diamonds, or createdAt.
 */
export async function updateExistingUserInFirestore(
  uid: string,
  changes: Record<string, any>,
  existingData?: Record<string, any> | null
): Promise<void> {
  if (!canAccessFirestoreAsUser(uid)) return;

  const userRef = doc(db, 'users', uid);
  let resolvedExisting = existingData;
  if (!resolvedExisting) {
    try {
      const snap = await getDoc(userRef);
      if (!snap.exists()) return;
      resolvedExisting = snap.data() || {};
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        handleFirestoreError(err, OperationType.GET, `users/${uid}`);
      }
      return;
    }
  }

  const { userPatch, publicPatch, privatePatch, settingsPatch } = buildFirestoreProfilePatch(
    resolvedExisting,
    changes
  );

  const splitFull = splitUserToFirestoreDocs(
    { ...resolvedExisting, ...changes, uid },
    { isInitialCreate: false }
  );

  const ops: Promise<any>[] = [];

  if (Object.keys(userPatch).length > 0) {
    ops.push(
      updateDoc(userRef, {
        ...userPatch,
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        if (isPermissionDeniedError(err)) handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
      })
    );
  }

  if (Object.keys(publicPatch).length > 0 && splitFull) {
    const pubRef = doc(db, 'public_profiles', uid);
    ops.push(
      getDoc(pubRef)
        .then((snap) =>
          snap.exists()
            ? updateDoc(pubRef, { ...publicPatch, updatedAt: serverTimestamp() })
            : setDoc(pubRef, {
                ...splitFull.publicProfileDoc,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
        )
        .catch((err) => {
          if (isPermissionDeniedError(err)) handleFirestoreError(err, OperationType.WRITE, `public_profiles/${uid}`);
        })
    );
  }

  if (Object.keys(privatePatch).length > 0 && splitFull) {
    const privRef = doc(db, 'users', uid, 'private', 'info');
    ops.push(
      getDoc(privRef)
        .then((snap) =>
          snap.exists()
            ? updateDoc(privRef, { ...privatePatch, updatedAt: serverTimestamp() })
            : setDoc(privRef, {
                ...splitFull.privateInfoDoc,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
        )
        .catch((err) => {
          if (isPermissionDeniedError(err)) handleFirestoreError(err, OperationType.WRITE, `users/${uid}/private/info`);
        })
    );
  }

  if (Object.keys(settingsPatch).length > 0 && splitFull) {
    const settingsRef = doc(db, 'user_settings', uid);
    ops.push(
      getDoc(settingsRef)
        .then((snap) =>
          snap.exists()
            ? updateDoc(settingsRef, { ...settingsPatch, updatedAt: serverTimestamp() })
            : setDoc(settingsRef, {
                ...splitFull.settingsDoc,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              })
        )
        .catch((err) => {
          if (isPermissionDeniedError(err)) handleFirestoreError(err, OperationType.WRITE, `user_settings/${uid}`);
        })
    );
  }

  await Promise.all(ops);
}

/**
 * Persists an authoritative wallet snapshot received from the backend server to Firestore.
 * Guarded so initial default fallbacks are never written blindly before hydration.
 */
export async function syncAuthoritativeWalletToFirestore(
  uid: string,
  userWithWallet: Record<string, any>
): Promise<void> {
  if (!canAccessFirestoreAsUser(uid) || !userWithWallet) return;
  if (typeof userWithWallet.coins !== 'number' && typeof userWithWallet.diamonds !== 'number') return;

  const walletRef = doc(db, 'users', uid, 'wallet', 'main');
  const walletPath = `users/${uid}/wallet/main`;

  try {
    const snap = await getDoc(walletRef);
    const payload = {
      uid,
      coins: clampNonNegativeInt(userWithWallet.coins, FIRESTORE_LIMITS.MAX_COINS, 0),
      diamonds: clampNonNegativeNumber(userWithWallet.diamonds, FIRESTORE_LIMITS.MAX_DIAMONDS, 0),
      diamondProgress: clampNonNegativeNumber(userWithWallet.diamondProgress, 1000, 0),
      pendingDiamondBatches: Array.isArray(userWithWallet.pendingDiamondBatches)
        ? userWithWallet.pendingDiamondBatches.slice(0, FIRESTORE_LIMITS.MAX_PENDING_BATCHES)
        : [],
      totalEarnedDiamonds: clampNonNegativeNumber(userWithWallet.totalEarnedDiamonds, FIRESTORE_LIMITS.MAX_DIAMONDS, 0),
      totalWithdrawnUzs: clampNonNegativeInt(userWithWallet.totalWithdrawnUzs, 10_000_000_000, 0),
      updatedAt: serverTimestamp(),
    };

    if (!snap.exists()) {
      await setDoc(walletRef, {
        ...payload,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(walletRef, payload);
    }
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      handleFirestoreError(err, OperationType.WRITE, walletPath);
    }
  }
}

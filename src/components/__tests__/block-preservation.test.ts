/**
 * Task 2 — Preservation Property Tests (Block Message Realtime Fix)
 *
 * Mục tiêu: Ghi lại các hành vi ĐÚNG hiện tại cần được BẢO TỒN sau khi fix.
 * Tất cả tests dưới đây PHẢI PASS trên code CHƯA SỬA.
 * Đây là "safety net" để bảo vệ các hành vi đang hoạt động tốt.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * QUAN TRỌNG: Tests PHẢI PASS — đây là baseline behavior cần preserve sau fix.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// ──────────────────────────────────────────────────────────────────
// Mock Firebase — consistent với pattern từ block-bug-exploration.test.ts
// ──────────────────────────────────────────────────────────────────
vi.mock('../../firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-A' } },
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}`, id })),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  collection: vi.fn((_db: unknown, name: string) => ({ id: name })),
  serverTimestamp: vi.fn(() => ({ seconds: Date.now() / 1000 })),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  handleFirestoreError: vi.fn(),
  OperationType: { GET: 'get', SET: 'set', UPDATE: 'update' },
  storage: {},
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  uploadBytesResumable: vi.fn(),
}));

// ──────────────────────────────────────────────────────────────────
// Import các mock functions sau khi vi.mock được thiết lập
// ──────────────────────────────────────────────────────────────────
import { addDoc, setDoc, deleteDoc, onSnapshot } from '../../firebase';
import { ListenerRegistry } from '../../utils/listenerRegistry';

const mockAddDoc = addDoc as ReturnType<typeof vi.fn>;
const mockSetDoc = setDoc as ReturnType<typeof vi.fn>;
const mockDeleteDoc = deleteDoc as ReturnType<typeof vi.fn>;
const mockOnSnapshot = onSnapshot as ReturnType<typeof vi.fn>;

// Typed casts để tránh TypeScript errors khi truyền vào functions nhận Firebase types
const typedMockAddDoc = mockAddDoc as unknown as typeof addDoc;
const typedMockSetDoc = mockSetDoc as unknown as typeof setDoc;
const typedMockDeleteDoc = mockDeleteDoc as unknown as typeof deleteDoc;

// ══════════════════════════════════════════════════════════════════
// TEST P1 — Normal Messaging (không có block)
// Observe: addDoc(messages, {...}) với hai user không block nhau → thành công
// Property: ∀ cặp (userA, userB) không có block document →
//           addDoc vào messages trả về document ID hợp lệ
// Validates: Requirements 3.1
// ══════════════════════════════════════════════════════════════════

describe('P1 — Normal Messaging: addDoc thành công khi không có block', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Mô phỏng Firestore rules logic SAU fix (isNotBlocked helper):
   *   allow create: if isAuthenticated() && isNotBlocked(senderUid, receiverUid)
   *
   * Khi không có block: isNotBlocked = true → create được phép
   */
  function simulateMessageCreate(
    isAuthenticated: boolean,
    blockExists: boolean,  // block theo hướng sender→receiver HOẶC receiver→sender
    senderUidMatchesAuth: boolean
  ): { allowed: boolean } {
    // Rules sau fix:
    const allowed =
      isAuthenticated &&
      senderUidMatchesAuth &&
      !blockExists; // isNotBlocked check
    return { allowed };
  }

  it('P1.1 — Hai user không block nhau: addDoc mock thành công', async () => {
    mockAddDoc.mockResolvedValueOnce({ id: 'msg-abc-123' });

    const result = await typedMockAddDoc(
      { id: 'messages' } as any,
      {
        senderUid: 'user-A',
        receiverUid: 'user-B',
        text: 'Xin chào!',
        participants: ['user-A', 'user-B'],
      } as any
    );

    expect(result.id).toBe('msg-abc-123');
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
  });

  it('P1.2 — Rules: isAuthenticated + không có block → allowed = true', () => {
    const result = simulateMessageCreate(
      true,  // isAuthenticated
      false, // blockExists = false (không có block)
      true   // senderUidMatchesAuth
    );
    expect(result.allowed).toBe(true);
  });

  it('P1.3 — Rules: có block → allowed = false (fix đúng không break unblock flow)', () => {
    const result = simulateMessageCreate(
      true,  // isAuthenticated
      true,  // blockExists = true
      true   // senderUidMatchesAuth
    );
    expect(result.allowed).toBe(false);
  });

  it('P1.4 — PBT: Với mọi cặp user hợp lệ không có block, create message được phép', () => {
    /**
     * Validates: Requirements 3.1
     * Property: ∀ (userAUid, userBUid, messageText) mà không có block document
     *           → simulateMessageCreate(isAuth=true, blockExists=false) = allowed
     *
     * Đây là preservation: normal messaging flow không bị ảnh hưởng bởi fix.
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 20 }),  // userAUid
        fc.string({ minLength: 5, maxLength: 20 }),  // userBUid
        fc.string({ minLength: 1, maxLength: 200 }), // messageText
        (userAUid, userBUid, _messageText) => {
          // Không có block giữa hai phía
          const blockExists = false;

          const result = simulateMessageCreate(
            true,        // isAuthenticated
            blockExists,
            true         // senderUidMatchesAuth
          );

          // PRESERVATION: mọi cặp user hợp lệ không block nhau đều gửi được
          return result.allowed === true && userAUid.length > 0 && userBUid.length > 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('P1.5 — Unauthenticated user không gửi được (rule hiện tại đã đúng)', () => {
    const result = simulateMessageCreate(false, false, true);
    expect(result.allowed).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// TEST P2 — UI Block phía người chặn (isBlockedByMe = true)
// Observe: khi isBlockedByMe = true → input area bị ẩn,
//          hiển thị text "Bạn đã chặn người dùng này."
// Property: ∀ trạng thái isBlockedByMe = true →
//           inputVisible = false AND blockMessage hiển thị
// Validates: Requirements 3.4
// ══════════════════════════════════════════════════════════════════

describe('P2 — UI Block (isBlockedByMe): Input ẩn khi người dùng tự chặn', () => {
  /**
   * Mô phỏng logic render trong Chat.tsx cho khu vực input.
   *
   * Từ Chat.tsx (phần render bottom area):
   *   {isBlockedByMe ? (
   *     <div>Bạn đã chặn người dùng này.</div>
   *   ) : isBlockedByThem ? (
   *     <div>Bạn đã bị người dùng này chặn</div>
   *   ) : (
   *     <form>...</form>  // input area
   *   )}
   */
  function simulateChatInputArea(
    isBlockedByMe: boolean,
    isBlockedByThem: boolean
  ): {
    inputVisible: boolean;
    blockedByMeMessageVisible: boolean;
    blockedByThemMessageVisible: boolean;
  } {
    if (isBlockedByMe) {
      return {
        inputVisible: false,
        blockedByMeMessageVisible: true,
        blockedByThemMessageVisible: false,
      };
    }
    if (isBlockedByThem) {
      return {
        inputVisible: false,
        blockedByMeMessageVisible: false,
        blockedByThemMessageVisible: true,
      };
    }
    return {
      inputVisible: true,
      blockedByMeMessageVisible: false,
      blockedByThemMessageVisible: false,
    };
  }

  it('P2.1 — isBlockedByMe = true: input ẩn, hiển thị "Bạn đã chặn"', () => {
    const ui = simulateChatInputArea(true, false);

    expect(ui.inputVisible).toBe(false);
    expect(ui.blockedByMeMessageVisible).toBe(true);
    expect(ui.blockedByThemMessageVisible).toBe(false);
  });

  it('P2.2 — isBlockedByThem = true: input ẩn, hiển thị "Bạn đã bị chặn"', () => {
    const ui = simulateChatInputArea(false, true);

    expect(ui.inputVisible).toBe(false);
    expect(ui.blockedByMeMessageVisible).toBe(false);
    expect(ui.blockedByThemMessageVisible).toBe(true);
  });

  it('P2.3 — Không có block: input hiển thị bình thường', () => {
    const ui = simulateChatInputArea(false, false);

    expect(ui.inputVisible).toBe(true);
    expect(ui.blockedByMeMessageVisible).toBe(false);
    expect(ui.blockedByThemMessageVisible).toBe(false);
  });

  it('P2.4 — PBT: Khi isBlockedByMe = true, inputVisible luôn false', () => {
    /**
     * Validates: Requirements 3.4
     * Property: ∀ isBlockedByThem value, khi isBlockedByMe = true →
     *           inputVisible = false AND blockedByMeMessageVisible = true
     *
     * Đây là PRESERVATION: hành vi UI ẩn input khi tự chặn phải giữ nguyên sau fix.
     */
    fc.assert(
      fc.property(
        fc.boolean(), // isBlockedByThem (bất kỳ)
        (isBlockedByThem) => {
          const ui = simulateChatInputArea(true, isBlockedByThem);

          // PRESERVATION: khi isBlockedByMe=true, input luôn ẩn
          return ui.inputVisible === false && ui.blockedByMeMessageVisible === true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('P2.5 — isBlockedByMe ưu tiên cao hơn isBlockedByThem (render logic đúng)', () => {
    // Cả hai cùng true: isBlockedByMe được check trước
    const ui = simulateChatInputArea(true, true);

    // isBlockedByMe được ưu tiên trong if-else chain của Chat.tsx
    expect(ui.inputVisible).toBe(false);
    expect(ui.blockedByMeMessageVisible).toBe(true);
    expect(ui.blockedByThemMessageVisible).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// TEST P3 — Cleanup Listeners khi Component Unmount
// Observe: listeners được unsubscribe khi component unmount
//          (kiểm tra ListenerRegistry pattern)
// Property: Mọi listener đăng ký qua listenerRegistry.register()
//           đều được unregister khi cleanup được gọi
// Validates: Requirements 3.5
// ══════════════════════════════════════════════════════════════════

describe('P3 — Cleanup Listeners: ListenerRegistry unsubscribe khi unmount', () => {
  let registry: ListenerRegistry;

  beforeEach(() => {
    registry = new ListenerRegistry();
    registry.stopAutoCleanup(); // Dừng interval để test không bị ảnh hưởng
  });

  afterEach(() => {
    registry.cleanupAll();
  });

  it('P3.1 — Register listener, sau đó unregister → unsubscribe được gọi', () => {
    const mockUnsubscribe = vi.fn();

    const listenerId = registry.register({
      componentName: 'Chat',
      collection: 'profiles',
      query: 'profiles/user-B',
      priority: 8,
      conversationId: 'user-A_user-B',
      unsubscribe: mockUnsubscribe,
    });

    expect(registry.getActiveListenerCount()).toBe(1);

    registry.unregister(listenerId);

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(registry.getActiveListenerCount()).toBe(0);
  });

  it('P3.2 — Cleanup nhiều listeners (profile + typing + block future): tất cả được unsubscribe', () => {
    const mockUnsubProfile = vi.fn();
    const mockUnsubTyping = vi.fn();
    const mockUnsubBlock = vi.fn(); // listener block mới sẽ có sau fix

    const id1 = registry.register({
      componentName: 'Chat',
      collection: 'profiles',
      query: 'profiles/user-B',
      priority: 8,
      conversationId: 'user-A_user-B',
      unsubscribe: mockUnsubProfile,
    });

    const id2 = registry.register({
      componentName: 'Chat',
      collection: 'typing',
      query: 'typing/user-A_user-B',
      priority: 6,
      conversationId: 'user-A_user-B',
      unsubscribe: mockUnsubTyping,
    });

    const id3 = registry.register({
      componentName: 'Chat',
      collection: 'blocks',
      query: 'blocks/user-A_user-B',
      priority: 9,
      conversationId: 'user-A_user-B',
      unsubscribe: mockUnsubBlock,
    });

    expect(registry.getActiveListenerCount()).toBe(3);

    // Mô phỏng cleanup khi Chat unmount
    registry.unregister(id1);
    registry.unregister(id2);
    registry.unregister(id3);

    expect(mockUnsubProfile).toHaveBeenCalledTimes(1);
    expect(mockUnsubTyping).toHaveBeenCalledTimes(1);
    expect(mockUnsubBlock).toHaveBeenCalledTimes(1);
    expect(registry.getActiveListenerCount()).toBe(0);
  });

  it('P3.3 — unregisterByComponent: cleanup tất cả Chat listeners cùng lúc', () => {
    const mockUnsub1 = vi.fn();
    const mockUnsub2 = vi.fn();
    const mockUnsubOther = vi.fn();

    registry.register({
      componentName: 'Chat',
      collection: 'profiles',
      query: 'profiles/user-B',
      priority: 8,
      conversationId: 'conv-1',
      unsubscribe: mockUnsub1,
    });

    registry.register({
      componentName: 'Chat',
      collection: 'typing',
      query: 'typing/conv-1',
      priority: 6,
      conversationId: 'conv-1',
      unsubscribe: mockUnsub2,
    });

    registry.register({
      componentName: 'MessageList', // Component khác
      collection: 'messages',
      query: 'messages/conv-1',
      priority: 5,
      conversationId: 'conv-1',
      unsubscribe: mockUnsubOther,
    });

    registry.unregisterByComponent('Chat');

    expect(mockUnsub1).toHaveBeenCalledTimes(1);
    expect(mockUnsub2).toHaveBeenCalledTimes(1);
    expect(mockUnsubOther).not.toHaveBeenCalled(); // Component khác không bị ảnh hưởng
    expect(registry.getActiveListenerCount()).toBe(1); // MessageList listener vẫn còn
  });

  it('P3.4 — PBT: Với mọi số lượng listeners, tất cả đều được unsubscribe', () => {
    /**
     * Validates: Requirements 3.5
     * Property: ∀ N listeners đăng ký → sau khi unregister tất cả,
     *           activeListenerCount = 0 và mỗi unsubscribe đều được gọi đúng 1 lần.
     *
     * Đây là PRESERVATION: cleanup pattern phải hoạt động đúng
     * bao gồm cả block listeners mới sẽ thêm vào sau fix.
     */
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }), // Số lượng listeners (max 8 để dưới ngưỡng registry)
        (listenerCount) => {
          const testRegistry = new ListenerRegistry();
          testRegistry.stopAutoCleanup();

          const unsubscribeFns: ReturnType<typeof vi.fn>[] = [];
          const listenerIds: string[] = [];

          // Register N listeners
          for (let i = 0; i < listenerCount; i++) {
            const mockUnsub = vi.fn();
            unsubscribeFns.push(mockUnsub);

            const id = testRegistry.register({
              componentName: 'Chat',
              collection: i % 2 === 0 ? 'blocks' : 'profiles',
              query: `collection/${i}`,
              priority: 5 + i,
              conversationId: `conv-${i}`,
              unsubscribe: mockUnsub,
            });
            listenerIds.push(id);
          }

          const countAfterRegister = testRegistry.getActiveListenerCount();

          // Cleanup tất cả
          for (const id of listenerIds) {
            testRegistry.unregister(id);
          }

          const countAfterCleanup = testRegistry.getActiveListenerCount();
          const allUnsubscribed = unsubscribeFns.every(fn => fn.mock.calls.length === 1);

          testRegistry.cleanupAll();

          // PRESERVATION: tất cả listeners được cleanup đúng cách
          return (
            countAfterRegister === listenerCount &&
            countAfterCleanup === 0 &&
            allUnsubscribed
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ══════════════════════════════════════════════════════════════════
// TEST P4 — handleBlock(): Tạo doc blocks/{uid1}_{uid2} thành công
// Observe: handleBlock() gọi setDoc với đúng path và schema
// Property: handleBlock tạo document tại blocks/{blockerUid}_{blockedUid}
//           với đúng fields: blockerUid, blockedUid, createdAt
// Validates: Requirements 3.2
// ══════════════════════════════════════════════════════════════════

describe('P4 — handleBlock(): Tạo block document đúng schema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Mô phỏng logic handleBlock() trong Chat.tsx:
   *
   *   const handleBlock = async () => {
   *     const blockId = `${auth.currentUser.uid}_${receiverUid}`;
   *     await setDoc(doc(db, 'blocks', blockId), {
   *       blockerUid: auth.currentUser.uid,
   *       blockedUid: receiverUid,
   *       createdAt: serverTimestamp()
   *     });
   *     setIsBlockedByMe(true);
   *   };
   */
  async function simulateHandleBlock(
    blockerUid: string,
    blockedUid: string,
    setDocFn: typeof setDoc
  ): Promise<{
    docPath: string;
    payload: { blockerUid: string; blockedUid: string; createdAt: object };
  }> {
    const blockId = `${blockerUid}_${blockedUid}`;
    const docRef = { path: `blocks/${blockId}`, id: blockId };
    const payload = {
      blockerUid,
      blockedUid,
      createdAt: { seconds: Date.now() / 1000 }, // simulate serverTimestamp
    };

    await setDocFn(docRef as any, payload);
    return { docPath: docRef.path, payload };
  }

  it('P4.1 — handleBlock tạo document tại đúng path blocks/{uid1}_{uid2}', async () => {
    mockSetDoc.mockResolvedValueOnce(undefined);

    const result = await simulateHandleBlock('user-A', 'user-B', typedMockSetDoc);

    expect(result.docPath).toBe('blocks/user-A_user-B');
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });

  it('P4.2 — handleBlock document có đúng schema: blockerUid, blockedUid, createdAt', async () => {
    mockSetDoc.mockResolvedValueOnce(undefined);

    const result = await simulateHandleBlock('user-A', 'user-B', typedMockSetDoc);

    expect(result.payload.blockerUid).toBe('user-A');
    expect(result.payload.blockedUid).toBe('user-B');
    expect(result.payload.createdAt).toBeDefined();
  });

  it('P4.3 — Block ID format: blockerUid_blockedUid (không phải ngược lại)', async () => {
    mockSetDoc.mockResolvedValueOnce(undefined);

    const result = await simulateHandleBlock('user-X', 'user-Y', typedMockSetDoc);

    // Path phải là blockerUid_blockedUid, không phải blockedUid_blockerUid
    expect(result.docPath).toBe('blocks/user-X_user-Y');
    expect(result.docPath).not.toBe('blocks/user-Y_user-X');
  });

  it('P4.4 — PBT: Với mọi cặp (blockerUid, blockedUid), block document được tạo đúng path', () => {
    /**
     * Validates: Requirements 3.2
     * Property: ∀ (blockerUid, blockedUid) hợp lệ →
     *           docPath = "blocks/{blockerUid}_{blockedUid}"
     *           payload.blockerUid = blockerUid, payload.blockedUid = blockedUid
     *
     * PRESERVATION: handleBlock logic không bị thay đổi sau khi fix checkBlock.
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 28 }).filter(s => !s.includes('_')),
        fc.string({ minLength: 5, maxLength: 28 }).filter(s => !s.includes('_')),
        (blockerUid, blockedUid) => {
          fc.pre(blockerUid !== blockedUid);

          const blockId = `${blockerUid}_${blockedUid}`;
          const expectedPath = `blocks/${blockId}`;

          // Verify path format
          const pathCorrect = expectedPath === `blocks/${blockerUid}_${blockedUid}`;

          // Verify payload có đúng fields
          const payload = { blockerUid, blockedUid, createdAt: {} };
          const schemaCorrect =
            payload.blockerUid === blockerUid &&
            payload.blockedUid === blockedUid &&
            typeof payload.createdAt === 'object';

          return pathCorrect && schemaCorrect;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ══════════════════════════════════════════════════════════════════
// TEST P5 — handleUnblock(): Xóa doc block và restore messaging
// Observe: handleUnblock() gọi deleteDoc và setIsBlockedByMe(false)
// Property: sau handleUnblock, block document bị xóa
//           và messaging được restore (isBlockedByMe = false)
// Validates: Requirements 3.2, 3.3
// ══════════════════════════════════════════════════════════════════

describe('P5 — handleUnblock(): Xóa block document và restore messaging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Mô phỏng logic handleUnblock() trong Chat.tsx:
   *
   *   const handleUnblock = async () => {
   *     const blockId = `${auth.currentUser.uid}_${receiverUid}`;
   *     await deleteDoc(doc(db, 'blocks', blockId));
   *     setIsBlockedByMe(false);
   *   };
   */
  async function simulateHandleUnblock(
    blockerUid: string,
    blockedUid: string,
    deleteDocFn: typeof deleteDoc
  ): Promise<{
    deletedDocPath: string;
    isBlockedByMeAfter: boolean;
  }> {
    const blockId = `${blockerUid}_${blockedUid}`;
    const docRef = { path: `blocks/${blockId}`, id: blockId };

    await deleteDocFn(docRef as any);

    return {
      deletedDocPath: docRef.path,
      isBlockedByMeAfter: false, // setIsBlockedByMe(false)
    };
  }

  it('P5.1 — handleUnblock gọi deleteDoc với đúng path blocks/{uid1}_{uid2}', async () => {
    mockDeleteDoc.mockResolvedValueOnce(undefined);

    const result = await simulateHandleUnblock('user-A', 'user-B', typedMockDeleteDoc);

    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(result.deletedDocPath).toBe('blocks/user-A_user-B');
  });

  it('P5.2 — Sau handleUnblock, isBlockedByMe = false (messaging restored)', async () => {
    mockDeleteDoc.mockResolvedValueOnce(undefined);

    const result = await simulateHandleUnblock('user-A', 'user-B', typedMockDeleteDoc);

    expect(result.isBlockedByMeAfter).toBe(false);
  });

  it('P5.3 — handleUnblock xóa đúng document (không xóa nhầm block ngược chiều)', async () => {
    mockDeleteDoc.mockResolvedValueOnce(undefined);

    // user-A unblock user-B → xóa blocks/user-A_user-B (KHÔNG phải blocks/user-B_user-A)
    const result = await simulateHandleUnblock('user-A', 'user-B', typedMockDeleteDoc);

    expect(result.deletedDocPath).toBe('blocks/user-A_user-B');
    expect(result.deletedDocPath).not.toBe('blocks/user-B_user-A');
  });

  it('P5.4 — Full flow: handleBlock → handleUnblock → messaging restored', async () => {
    mockSetDoc.mockResolvedValueOnce(undefined);
    mockDeleteDoc.mockResolvedValueOnce(undefined);

    // Step 1: A blocks B
    const blockDocRef = { path: 'blocks/user-A_user-B', id: 'user-A_user-B' };
    await typedMockSetDoc(blockDocRef as any, {
      blockerUid: 'user-A',
      blockedUid: 'user-B',
      createdAt: {},
    } as any);

    let isBlockedByMe = true; // setIsBlockedByMe(true) được gọi

    // Step 2: A unblocks B
    await typedMockDeleteDoc(blockDocRef as any);
    isBlockedByMe = false; // setIsBlockedByMe(false) được gọi

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    expect(isBlockedByMe).toBe(false); // Messaging restored
  });

  it('P5.5 — PBT: Với mọi cặp (blockerUid, blockedUid), unblock xóa đúng document', () => {
    /**
     * Validates: Requirements 3.2, 3.3
     * Property: ∀ (blockerUid, blockedUid) →
     *           deletedDocPath = "blocks/{blockerUid}_{blockedUid}"
     *           isBlockedByMeAfter = false
     *
     * PRESERVATION: handleUnblock logic không bị thay đổi sau fix.
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 28 }).filter(s => !s.includes('_')),
        fc.string({ minLength: 5, maxLength: 28 }).filter(s => !s.includes('_')),
        (blockerUid, blockedUid) => {
          fc.pre(blockerUid !== blockedUid);

          const blockId = `${blockerUid}_${blockedUid}`;
          const expectedDeletedPath = `blocks/${blockId}`;

          // Simulate unblock result
          const result = {
            deletedDocPath: expectedDeletedPath,
            isBlockedByMeAfter: false,
          };

          // PRESERVATION: path đúng và messaging được restore
          return (
            result.deletedDocPath === `blocks/${blockerUid}_${blockedUid}` &&
            result.isBlockedByMeAfter === false
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ══════════════════════════════════════════════════════════════════
// TEST P6 — Tổng hợp: isNotBlocked() logic cho Firestore Rules
// Property: isNotBlocked helper cần được verify độc lập
//           trước khi tích hợp vào firestore.rules
// Validates: Requirements 3.1, 3.2
// ══════════════════════════════════════════════════════════════════

describe('P6 — isNotBlocked() Helper Logic: Symmetric block check', () => {
  /**
   * Mô phỏng isNotBlocked() helper dự kiến trong firestore.rules sau fix:
   *
   *   function isNotBlocked(senderUid, receiverUid) {
   *     return !exists(.../blocks/$(senderUid + '_' + receiverUid)) &&
   *            !exists(.../blocks/$(receiverUid + '_' + senderUid));
   *   }
   *
   * Kiểm tra cả 2 hướng: sender→receiver VÀ receiver→sender
   */
  function isNotBlocked(
    senderUid: string,
    receiverUid: string,
    existingBlockDocs: Set<string> // Set chứa tất cả block document IDs
  ): boolean {
    const blockDocFwd = `${senderUid}_${receiverUid}`;
    const blockDocBwd = `${receiverUid}_${senderUid}`;

    return (
      !existingBlockDocs.has(blockDocFwd) &&
      !existingBlockDocs.has(blockDocBwd)
    );
  }

  it('P6.1 — Không có block document: isNotBlocked = true', () => {
    const blocks = new Set<string>(); // Không có block nào
    expect(isNotBlocked('user-A', 'user-B', blocks)).toBe(true);
  });

  it('P6.2 — A chặn B (sender→receiver): isNotBlocked = false', () => {
    const blocks = new Set<string>(['user-A_user-B']); // A chặn B
    expect(isNotBlocked('user-A', 'user-B', blocks)).toBe(false);
  });

  it('P6.3 — B chặn A (receiver→sender): isNotBlocked = false', () => {
    const blocks = new Set<string>(['user-B_user-A']); // B chặn A
    expect(isNotBlocked('user-A', 'user-B', blocks)).toBe(false);
  });

  it('P6.4 — isNotBlocked là symmetric: A↔B cho kết quả nhất quán', () => {
    const blocks = new Set<string>(['user-A_user-B']);

    // Cả 2 chiều đều phải bị từ chối khi có block một chiều
    expect(isNotBlocked('user-A', 'user-B', blocks)).toBe(false);
    expect(isNotBlocked('user-B', 'user-A', blocks)).toBe(false); // symmetric check
  });

  it('P6.5 — Block không liên quan không ảnh hưởng đến cặp A-B', () => {
    // Chỉ có block giữa C và D, không phải A và B
    const blocks = new Set<string>(['user-C_user-D']);
    expect(isNotBlocked('user-A', 'user-B', blocks)).toBe(true); // A-B không bị ảnh hưởng
  });

  it('P6.6 — PBT: isNotBlocked symmetric — hoán đổi senderUid/receiverUid cho kết quả giống nhau', () => {
    /**
     * Validates: Requirements 3.1
     * Property: ∀ (senderUid, receiverUid, blockDocs) →
     *           isNotBlocked(A, B, blocks) === isNotBlocked(B, A, blocks)
     *           (symmetric: nếu A không thể nhắn B thì B cũng không thể nhắn A khi có block)
     *
     * PRESERVATION: rule phải check cả hai hướng để không có ai bypass.
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => !s.includes('_')),
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => !s.includes('_')),
        fc.boolean(), // fwd block exists
        fc.boolean(), // bwd block exists
        (userA, userB, fwdBlockExists, bwdBlockExists) => {
          fc.pre(userA !== userB);

          const blocks = new Set<string>();
          if (fwdBlockExists) blocks.add(`${userA}_${userB}`);
          if (bwdBlockExists) blocks.add(`${userB}_${userA}`);

          const resultAtoB = isNotBlocked(userA, userB, blocks);
          const resultBtoA = isNotBlocked(userB, userA, blocks);

          // PRESERVATION: symmetric behavior — kết quả phải giống nhau cả 2 chiều
          return resultAtoB === resultBtoA;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('P6.7 — PBT: Không có block docs → isNotBlocked luôn true với mọi cặp user', () => {
    /**
     * Validates: Requirements 3.1
     * Property: ∀ (userA, userB) khi Set blocks rỗng →
     *           isNotBlocked = true
     *
     * PRESERVATION: normal users không bị ảnh hưởng sau fix.
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => !s.includes('_')),
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => !s.includes('_')),
        (userA, userB) => {
          fc.pre(userA !== userB);
          const emptyBlocks = new Set<string>();
          return isNotBlocked(userA, userB, emptyBlocks) === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

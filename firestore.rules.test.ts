// @vitest-environment node
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST;
const describeWithEmulator = emulatorAddress ? describe : describe.skip;

describeWithEmulator('Firestore security rules for social features', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, portText] = emulatorAddress!.split(':');
    environment = await initializeTestEnvironment({
      projectId: 'tvu-connect-rules-test',
      firestore: {
        host,
        port: Number(portText),
        rules: await readFile('firestore.rules', 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
  });

  afterAll(async () => {
    await environment?.cleanup();
  });

  const seed = async (entries: Array<[string, Record<string, unknown>]>) => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await Promise.all(entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)));
    });
  };

  it('chỉ cho chủ hồ sơ cập nhật dữ liệu cá nhân', async () => {
    const studentA = environment.authenticatedContext('student-a').firestore();
    const studentB = environment.authenticatedContext('student-b').firestore();

    await assertSucceeds(setDoc(doc(studentA, 'profiles/student-a'), {
      uid: 'student-a',
      fullName: 'Sinh viên A',
    }));
    await assertFails(setDoc(doc(studentB, 'profiles/student-a'), {
      uid: 'student-a',
      fullName: 'Giả mạo',
    }));
    await assertFails(setDoc(doc(studentA, 'profiles/student-a'), {
      location: { lat: 9.9419, lng: 106.33859 },
      showLocation: true,
    }, { merge: true }));
  });

  it('buộc hẹn hò đi qua transaction phía server', async () => {
    await seed([
      ['profiles/student-a', { uid: 'student-a', age: 20, datingEnabled: true }],
      ['profiles/student-b', { uid: 'student-b', age: 21, datingEnabled: true }],
    ]);
    const studentA = environment.authenticatedContext('student-a').firestore();

    await assertFails(setDoc(doc(studentA, 'datingDecisions/student-a_student-b'), {
      fromUid: 'student-a',
      toUid: 'student-b',
      action: 'like',
    }));
    await assertFails(setDoc(doc(studentA, 'datingMatches/student-a_student-b'), {
      participantUids: ['student-a', 'student-b'],
    }));
  });

  it('khóa tạo cuộc gọi ở server nhưng cho đúng người cập nhật signaling', async () => {
    await seed([
      ['calls/call-1', {
        callerUid: 'student-a',
        calleeUid: 'student-b',
        participantUids: ['student-a', 'student-b'],
        kind: 'video',
        status: 'ringing',
        offer: { type: 'offer', sdp: 'v=0' },
      }],
      ['activeCallLocks/student-a', { uid: 'student-a', callId: 'call-1' }],
    ]);
    const studentA = environment.authenticatedContext('student-a').firestore();
    const studentB = environment.authenticatedContext('student-b').firestore();
    const outsider = environment.authenticatedContext('student-c').firestore();

    await assertFails(setDoc(doc(studentA, 'calls/client-created'), {
      callerUid: 'student-a',
      calleeUid: 'student-b',
      participantUids: ['student-a', 'student-b'],
      kind: 'audio',
      status: 'ringing',
    }));
    await assertSucceeds(getDoc(doc(studentA, 'calls/call-1')));
    await assertFails(getDoc(doc(outsider, 'calls/call-1')));
    await assertSucceeds(updateDoc(doc(studentB, 'calls/call-1'), {
      answer: { type: 'answer', sdp: 'v=0' },
      status: 'connecting',
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(studentA, 'calls/call-1/callerCandidates/ice-1'), {
      candidate: 'candidate:1',
    }));
    await assertFails(setDoc(doc(studentB, 'calls/call-1/callerCandidates/ice-2'), {
      candidate: 'candidate:2',
    }));
    await assertFails(getDoc(doc(studentA, 'activeCallLocks/student-a')));
  });

  it('giữ tin nhắn đúng người nhận và không cho client ghi đè hội thoại', async () => {
    const studentA = environment.authenticatedContext('student-a').firestore();
    const studentB = environment.authenticatedContext('student-b').firestore();

    await assertSucceeds(setDoc(doc(studentA, 'messages/message-1'), {
      senderUid: 'student-a',
      receiverUid: 'student-b',
      participants: ['student-a', 'student-b'],
      conversationId: 'student-a_student-b',
      type: 'text',
      text: 'Chào bạn',
      read: false,
      createdAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(studentB, 'messages/message-1'), { read: true }));
    await assertFails(updateDoc(doc(studentB, 'messages/message-1'), { text: 'Đã sửa' }));
    await assertFails(setDoc(doc(studentA, 'conversations/student-a_student-b'), {
      participants: ['student-a', 'student-b'],
    }));
  });

  it('chỉ cho chủ hộp thư đọc và đánh dấu thông báo do server tạo', async () => {
    await seed([
      ['users/student-a/notifications/event-1', {
        recipientUid: 'student-a',
        type: 'friend_request',
        title: 'Bạn có lời mời kết bạn',
        body: 'Mở ứng dụng để xem.',
        readAt: null,
        createdAt: new Date('2026-09-19T00:00:00Z'),
      }],
      ['users/student-a/notifications/legacy-event', {
        type: 'message',
        title: 'Tin nhắn cũ',
        body: 'Thông báo này được tạo trước khi có recipientUid.',
        readAt: null,
        createdAt: new Date('2026-09-18T00:00:00Z'),
      }],
    ]);
    const studentA = environment.authenticatedContext('student-a').firestore();
    const studentB = environment.authenticatedContext('student-b').firestore();
    const notification = doc(studentA, 'users/student-a/notifications/event-1');

    await assertSucceeds(getDoc(notification));
    await assertSucceeds(getDocs(collection(studentA, 'users/student-a/notifications')));
    await assertFails(getDoc(doc(studentB, 'users/student-a/notifications/event-1')));
    await assertSucceeds(updateDoc(notification, { readAt: serverTimestamp() }));
    await assertFails(updateDoc(notification, { title: 'Nội dung giả mạo' }));
    await assertFails(setDoc(doc(studentA, 'users/student-a/notifications/fake'), {
      recipientUid: 'student-a',
      type: 'system',
    }));
  });

  it('xác thực tác giả bình luận và khóa bộ đếm phía server', async () => {
    await seed([
      ['posts/post-1', {
        userId: 'student-a',
        content: 'Bài viết',
        commentCount: 0,
      }],
      ['comments/comment-1', {
        postId: 'post-1',
        userId: 'student-a',
        content: 'Bình luận gốc',
        likes: [],
        likeCount: 0,
        replyCount: 0,
      }],
    ]);
    const studentA = environment.authenticatedContext('student-a').firestore();
    const studentB = environment.authenticatedContext('student-b').firestore();

    await assertSucceeds(setDoc(doc(studentB, 'comments/reply-1'), {
      postId: 'post-1',
      parentCommentId: 'comment-1',
      userId: 'student-b',
      content: 'Một phản hồi hợp lệ',
      likes: [],
      likeCount: 0,
      createdAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(studentB, 'comments/forged'), {
      postId: 'post-1',
      userId: 'student-a',
      content: 'Giả mạo tác giả',
      likes: [],
      likeCount: 0,
    }));
    await assertFails(updateDoc(doc(studentB, 'comments/comment-1'), { replyCount: 99 }));
    await assertFails(updateDoc(doc(studentB, 'posts/post-1'), { commentCount: 99 }));
    await assertSucceeds(updateDoc(doc(studentA, 'comments/comment-1'), {
      content: 'Nội dung đã sửa',
      isEdited: true,
      editedAt: serverTimestamp(),
    }));
  });

  it('chặn ghi sai phạm vi phòng học, đánh giá và vị trí trọ', async () => {
    await seed([
      ['studyRooms/room-1', { ownerUid: 'student-a', status: 'open' }],
      ['studyRooms/room-1/participants/student-a', { uid: 'student-a' }],
      ['studyRooms/room-1/participants/student-b', { uid: 'student-b' }],
      ['places/place-1', { name: 'Quán ăn TVU' }],
    ]);
    const studentA = environment.authenticatedContext('student-a').firestore();
    const studentB = environment.authenticatedContext('student-b').firestore();

    await assertFails(setDoc(doc(studentA, 'studyRooms/room-1/participants/student-c'), {
      uid: 'student-c',
    }));
    await assertSucceeds(setDoc(doc(studentA, 'studyRooms/room-1/signals/signal-1'), {
      fromUid: 'student-a',
      toUid: 'student-b',
      type: 'offer',
      description: { type: 'offer', sdp: 'v=0' },
      createdAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(studentA, 'studyRooms/room-1'), {
      youtubeVideoId: 'dQw4w9WgXcQ',
      youtubeUpdatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(studentB, 'studyRooms/room-1'), {
      youtubeVideoId: 'M7lc1UVf-VE',
      youtubeUpdatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(studentA, 'studyRooms/room-1'), {
      youtubeVideoId: 'not-a-valid-video-id-that-is-too-long',
      youtubeUpdatedAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(studentA, 'communityReviews/place_place-1_student-a'), {
      userId: 'student-a',
      userName: 'Sinh viên A',
      targetKind: 'place',
      targetId: 'place-1',
      rating: 5,
      content: 'Không gian học nhóm khá tốt.',
    }));
    await assertSucceeds(setDoc(doc(studentA, 'communityReviews/google_place_google:ChIJTraVinh_student-a'), {
      userId: 'student-a',
      userName: 'Sinh viên A',
      targetKind: 'google_place',
      targetId: 'google:ChIJTraVinh',
      rating: 4,
      content: 'Quán có giá phù hợp với sinh viên.',
    }));
    await assertFails(setDoc(doc(studentA, 'rentalPosts/outside-tra-vinh'), {
      createdBy: 'student-a',
      location: { lat: 11, lng: 107 },
      geohash: 'w3g',
    }));
  });

  it('không để client đọc tọa độ sống hoặc tự tạo quan hệ bạn bè và chạm mặt', async () => {
    await seed([
      ['friendRequests/student-a_student-b', {
        fromUid: 'student-a',
        toUid: 'student-b',
        participantUids: ['student-a', 'student-b'],
        status: 'pending',
      }],
      ['friendships/student-a_student-b', {
        participantUids: ['student-a', 'student-b'],
        status: 'accepted',
      }],
      ['privateLiveLocations/student-a', {
        uid: 'student-a',
        latitude: 9.9419,
        longitude: 106.33859,
      }],
      ['sharedStudentLocations/student-a', {
        uid: 'student-a',
        latitude: 9.94,
        longitude: 106.34,
        visibility: 'tvu',
      }],
      ['locationPreferences/student-a', {
        uid: 'student-a',
        visibility: 'friends',
      }],
      ['studentEncounters/student-a_student-b_1', {
        participantUids: ['student-a', 'student-b'],
        distanceBand: 'nearby',
      }],
    ]);
    const studentA = environment.authenticatedContext('student-a').firestore();
    const studentB = environment.authenticatedContext('student-b').firestore();
    const outsider = environment.authenticatedContext('student-c').firestore();

    await assertSucceeds(getDoc(doc(studentA, 'friendRequests/student-a_student-b')));
    await assertSucceeds(getDocs(query(
      collection(studentB, 'friendRequests'),
      where('toUid', '==', 'student-b'),
      where('status', '==', 'pending'),
    )));
    await assertSucceeds(getDoc(doc(studentB, 'friendships/student-a_student-b')));
    await assertFails(getDoc(doc(outsider, 'friendships/student-a_student-b')));
    await assertFails(setDoc(doc(studentA, 'friendships/student-a_student-c'), {
      participantUids: ['student-a', 'student-c'],
      status: 'accepted',
    }));

    await assertFails(getDoc(doc(studentA, 'privateLiveLocations/student-a')));
    await assertFails(getDoc(doc(studentA, 'sharedStudentLocations/student-a')));
    await assertSucceeds(getDoc(doc(studentA, 'locationPreferences/student-a')));
    await assertFails(getDoc(doc(studentB, 'locationPreferences/student-a')));
    await assertFails(setDoc(doc(studentA, 'locationPreferences/student-a'), {
      visibility: 'tvu',
    }));

    await assertSucceeds(getDoc(doc(studentA, 'studentEncounters/student-a_student-b_1')));
    await assertFails(getDoc(doc(outsider, 'studentEncounters/student-a_student-b_1')));
    await assertFails(setDoc(doc(studentA, 'studentEncounters/fake'), {
      participantUids: ['student-a', 'student-c'],
    }));
  });
});

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

/** A compact, serializable chat history accepted by the callable function. */
export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface StudentAssistantResponse {
  answer: string;
}

const errorMessageFor = (error: unknown): string => {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: string }).code)
    : '';

  switch (code) {
    case 'functions/unauthenticated':
    case 'unauthenticated':
      return 'Bạn cần đăng nhập để dùng trợ lý học tập.';
    case 'functions/resource-exhausted':
    case 'resource-exhausted':
      return 'Bạn đã hỏi khá nhiều. Hãy đợi khoảng một phút rồi thử lại nhé.';
    case 'functions/failed-precondition':
    case 'failed-precondition':
      return 'Trợ lý AI chưa được quản trị viên cấu hình.';
    case 'functions/deadline-exceeded':
    case 'deadline-exceeded':
      return 'Trợ lý phản hồi chậm hơn bình thường. Hãy thử lại sau ít phút.';
    case 'functions/unavailable':
    case 'unavailable':
      return 'Dịch vụ AI đang tạm bận. Hãy thử lại sau.';
    default:
      return 'Chưa thể nhận phản hồi từ trợ lý. Vui lòng thử lại.';
  }
};

/**
 * Calls the server instead of Gemini directly. This keeps the provider key out
 * of the web bundle and lets the server enforce a per-student rate limit.
 */
export async function sendMessageToAI(
  userText: string,
  chatHistory: ChatMessage[] = [],
): Promise<string> {
  const message = userText.trim();
  if (!message) throw new Error('Hãy nhập câu hỏi trước khi gửi.');

  const askStudentAssistant = httpsCallable<
    { message: string; history: ChatMessage[] },
    StudentAssistantResponse
  >(functions, 'askStudentAssistant', { timeout: 45_000 });

  try {
    const result = await askStudentAssistant({
      message,
      history: chatHistory.slice(-8),
    });
    const answer = result.data?.answer?.trim();
    if (!answer) throw new Error('Trợ lý chưa trả về nội dung hợp lệ.');
    return answer;
  } catch (error) {
    throw new Error(errorMessageFor(error));
  }
}

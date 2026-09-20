# TVU Connect

Nền tảng hỗ trợ sinh viên Đại học Trà Vinh tìm bạn cùng ngành, tìm trọ, trao đổi tài liệu, trò chuyện và gọi trực tiếp.

## Tính năng chính

- Tìm sinh viên theo tên, lớp, ngành, niên khóa và tùy chọn **Quanh đây**. Vị trí chỉ lưu theo ô gần đúng 1–2 km và có thể tắt bất cứ lúc nào.
- Bản đồ bạn bè kiểu Zenly trong tab **Khám phá → Bạn bè**: kết bạn hai chiều, chọn chia sẻ cho bạn bè/cùng ngành/toàn TVU, xem lần cập nhật cuối và nhận cảnh báo chạm mặt khi cả hai cùng đồng ý.
- Tìm trọ quanh vị trí hiện tại tại Trà Vinh theo bán kính 1/3/5/10 km; tin mới có tọa độ, tiền cọc, điện, nước, điều kiện ở ghép và review sinh viên hiển thị ngay trong web.
- Tìm quán ăn quanh Trà Vinh bằng Google Places trực tiếp và dữ liệu cộng đồng TVU; lọc món Việt, cà phê/trà, ăn vặt, tráng miệng, món chay, quán đang mở, quán nổi bật và địa điểm mới/sắp mở ngay trong web.
- Nhắn tin, thông báo tin nhắn mới và gọi thoại/video WebRTC. Media đi trực tiếp giữa hai thiết bị khi mạng cho phép.
- Gọi nhanh kiểu “nói chuyện trước”: chọn trò chuyện thoải mái hoặc học 1–1, hệ thống ghép người đang chờ rồi mở cuộc gọi thoại; không tự tạo đoạn chat.
- Phòng học thoại nhóm tối đa 8 sinh viên. Ứng dụng không đặt bộ đếm tự ngắt; thời lượng thực tế vẫn phụ thuộc mạng, pin, trình duyệt và TURN.
- Hẹn hò 18+ theo cơ chế vuốt, chỉ dành cho hồ sơ tự nguyện tham gia. Sinh viên có thể ẩn ảnh trên thẻ hẹn hò; trò chuyện chỉ mở sau khi hai bên cùng thích.
- Kho tài liệu theo ngành, có bộ lọc sách/giáo trình. Chỉ dùng nguồn mở, nguồn chính thức hoặc nội dung được phép chia sẻ.
- TVU Buddy: trợ lý học tập chạy qua Firebase Cloud Functions, không đưa khóa AI vào trình duyệt.

## Chạy ở máy cá nhân

Yêu cầu Node.js 22 trở lên và Firebase CLI. Cloud Functions đang dùng runtime Node.js 22 để tương thích với Firebase Admin SDK hiện tại.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Điền các biến `VITE_FIREBASE_*` và `VITE_FIREBASE_VAPID_KEY` trong `.env.local` bằng cấu hình web app của Firebase. Đây là cấu hình public của ứng dụng, không phải khóa Gemini.

## Kết nối Google Drive cho thư viện

TVU Connect không nhúng thẳng trang Google Preview cho file riêng tư. File công khai được tải bằng Drive API; file riêng tư yêu cầu người dùng kết nối và chọn đúng file bằng Google Picker, sau đó nội dung được hiển thị từ blob URL trong phiên hiện tại. Ứng dụng dùng scope `drive.file`, không xin quyền đọc toàn bộ Drive và không lưu access token vào Firestore/localStorage.

1. Trong cùng Google Cloud project, bật **Google Drive API** và **Google Picker API**.
2. Cấu hình OAuth consent screen. Khi app còn ở chế độ Testing, thêm các tài khoản thử nghiệm vào **Test users**.
3. Tạo OAuth Client ID loại **Web application**. Thêm chính xác các origin đang chạy vào **Authorized JavaScript origins**, ví dụ:

```text
http://localhost:3000
http://localhost:3001
https://ten-mien-production.example
```

4. Tạo API key dành cho trình duyệt, giới hạn theo website/referrer của localhost và tên miền production; giới hạn API cho Drive API và Picker API.
5. Điền cấu hình vào `.env.local` rồi khởi động lại Vite:

```bash
VITE_GOOGLE_DRIVE_API_KEY=api_key_trinh_duyet
VITE_GOOGLE_CLIENT_ID=oauth_web_client_id.apps.googleusercontent.com
VITE_GOOGLE_DRIVE_APP_ID=google_cloud_project_number
```

`VITE_GOOGLE_DRIVE_APP_ID` là **Project number** dạng số, không phải Project ID dạng chữ. Nếu bỏ trống, ứng dụng thử suy ra số này từ OAuth Client ID. Firebase Google Sign-in và quyền Drive là hai consent khác nhau; đăng nhập TVU Connect không tự cấp quyền đọc file Drive.

## Cài AI miễn phí, an toàn

TVU Buddy sử dụng `gemini-2.5-flash` qua server. Google hiện có free tier cho model này, nhưng hạn mức có thể thay đổi; xem [trang giá Gemini](https://ai.google.dev/gemini-api/docs/pricing) trước khi triển khai.

1. Tạo **authorization key** mới tại [Google AI Studio](https://aistudio.google.com/app/apikey). Từ tháng 9/2026, standard key cũ có thể bị Gemini API từ chối; trong trang API Keys, kiểm tra cột **Key Type** và thay key loại Standard bằng key loại Auth.
2. Đăng nhập Firebase CLI và chọn project:

```bash
firebase login
firebase use tvu-connect-1dc97
```

3. Lưu key bằng Firebase Secret Manager, không thêm nó vào `.env.local` hay bất kỳ biến `VITE_*` nào:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

Firebase CLI sẽ yêu cầu bạn dán key sau khi chạy lệnh. Function `askStudentAssistant` là function duy nhất được cấp quyền đọc secret này.

4. Cài dependencies cho Functions rồi deploy:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions:askStudentAssistant
```

Cloud Function áp dụng giới hạn 8 yêu cầu/phút/tài khoản. Firebase có thể yêu cầu liên kết tài khoản thanh toán để deploy Cloud Functions dù API Gemini đang dùng hạn mức miễn phí; kiểm tra hạn mức và bật cảnh báo ngân sách trước khi chạy production.

Để chạy Functions local, tạo `functions/.secret.local` (file này đã được ignore) với nội dung sau rồi dùng emulator:

```bash
GEMINI_API_KEY=dan_key_cua_ban
firebase emulators:start --only functions
```

## Bật nguồn quán ăn Google Places

Tính năng **Khám phá → Ăn gần** gọi Places API (New) qua Cloud Function; API key không được đưa vào bundle trình duyệt và nội dung Google không được sao chép vào Firestore.

1. Trong Google Cloud Console của project Firebase, bật **Places API (New)** và bật billing. Giới hạn key chỉ cho Places API, đặt quota/ngân sách trước khi phát hành.
2. Tạo API key riêng cho backend rồi lưu bằng Secret Manager:

```bash
firebase functions:secrets:set GOOGLE_PLACES_API_KEY
```

3. Deploy Function:

```bash
firebase deploy --only functions:discoverFoodPlaces
```

Function giới hạn 12 lần làm mới mỗi giờ cho một tài khoản và mỗi lần chỉ lấy tối đa 20 kết quả trong 10 km. Các trường điểm đánh giá/giờ mở cửa có thể thuộc SKU cao hơn; luôn kiểm tra [bảng giá Google Maps Platform](https://developers.google.com/maps/billing-and-pricing/pricing) hiện hành. Không thêm secret này vào `.env.local` hoặc biến `VITE_*`.

Khi chạy emulator, thêm vào `functions/.secret.local`:

```bash
GOOGLE_PLACES_API_KEY=key_backend_cua_ban
```

## Bật thông báo tin nhắn và cuộc gọi

1. Trong Firebase Console, vào **Project settings → Cloud Messaging → Web configuration** và tạo/lấy VAPID key.
2. Đặt key vào `VITE_FIREBASE_VAPID_KEY` trong `.env.local`.
3. Deploy Functions, rules và indexes lên Firebase:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules,firestore:indexes
```

Ứng dụng web hiện được build trên Vercel, vì vậy chủ project Vercel cần đặt cùng `VITE_FIREBASE_VAPID_KEY` trong Environment Variables rồi redeploy frontend.

Sau khi đăng nhập, ứng dụng sẽ hỏi quyền thông báo một lần. Token thiết bị được lưu riêng dưới `users/{uid}/fcmTokens`; chỉ chính sinh viên đó có quyền đọc/ghi token của mình.

## Nâng cấp dữ liệu đang có

Nếu Firestore đã có hồ sơ hoặc bản ghi chặn từ phiên bản cũ, chạy migration một lần để thêm chỉ mục tìm bạn, chuẩn hóa quan hệ chặn và xóa trường tọa độ chính xác `profiles.location` cũ. Script mặc định chỉ thống kê, không ghi dữ liệu:

```bash
npm run migrate:student-data
```

Sau khi kiểm tra số lượng, chạy thật bằng:

```bash
npm run migrate:student-data -- --apply
```

Script dùng Firebase Admin Application Default Credentials. Hãy đặt `GOOGLE_APPLICATION_CREDENTIALS` tới file service account nằm ngoài repository và tuyệt đối không commit file đó. Bản ghi block cũ được giữ lại; script tạo thêm định danh chuẩn và loại bỏ tọa độ hồ sơ công khai cũ. Vị trí sống mới chỉ được ghi qua Cloud Functions.

Tin trọ cũ cần thêm geohash để truy vấn bán kính không bị giới hạn bởi số tin mới nhất. Chạy dry-run trước, sau đó mới áp dụng:

```bash
npm run migrate:rental-geohashes
npm run migrate:rental-geohashes -- --apply
```

## Gọi thoại và video

Cuộc gọi dùng WebRTC với nhiều STUN công khai trên cổng 80, 3478 và 19302. STUN chỉ giúp tìm đường trực tiếp; Wi‑Fi có AP isolation, NAT đối xứng hoặc chặn UDP vẫn bắt buộc cần TURN qua TCP/TLS cổng 443. Production dùng credential TURN ngắn hạn do backend cấp.

`VITE_TURN_URL` nhận một hoặc nhiều URL phân cách bằng dấu phẩy. `VITE_TURN_*` chỉ dành cho thử nghiệm vì biến `VITE_*` hiển thị trong web bundle. Với production, dùng credential TURN ngắn hạn do server cấp; không đưa mật khẩu TURN cố định vào frontend.

Relay production đang dùng callable Function `getTurnIceServers` để lấy credential Cloudflare TURN có hạn 6 giờ. Sau khi tạo TURN key trong Cloudflare Realtime, lưu hai secret vào đúng Firebase project rồi chỉ deploy function này:

```bash
firebase functions:secrets:set TURN_KEY_ID --project tvu-connect-1dc97
firebase functions:secrets:set TURN_KEY_API_TOKEN --project tvu-connect-1dc97
firebase deploy --only functions:getTurnIceServers --project tvu-connect-1dc97
```

Không đưa hai secret trên vào Git, `.env` hoặc biến Vercel. Khi function riêng chưa được cấu hình, app chỉ có thể thử kết nối trực tiếp qua STUN và sẽ giải thích rõ nếu mạng Wi-Fi bắt buộc phải có TURN.

### Gọi nhanh và phòng học nhóm

Gọi nhanh dùng callable Function `matchVoicePartner` để ghép hàng chờ theo mục đích (`casual` hoặc `study`). Việc chọn cặp chạy trong transaction ở server; client không được tự ghi người ghép. Deploy function cùng rules và indexes:

```bash
firebase deploy --only functions:matchVoicePartner,functions:joinStudyRoom,functions:leaveStudyRoom,firestore:rules,firestore:indexes
```

Phòng học nhóm dùng WebRTC dạng mesh: mỗi trình duyệt kết nối trực tiếp với các thành viên còn lại, phù hợp nhóm nhỏ và hiện giới hạn 8 người để giữ chất lượng. Việc vào/rời phòng chạy qua transaction ở Cloud Functions, vì vậy nhiều sinh viên bấm vào cùng lúc vẫn không thể vượt quá số chỗ. Không có giới hạn thời gian do ứng dụng áp đặt. Khi triển khai thực tế, hãy cấu hình TURN ngắn hạn để tăng khả năng kết nối trên mạng ký túc xá/di động.

### Hẹn hò ẩn mặt

- Chỉ hồ sơ có `datingEnabled: true` và tuổi từ 18 mới được đề xuất.
- Khi `hideFaceInDating: true`, giao diện thẻ hẹn hò không tải ảnh đại diện và thay bằng avatar chữ.
- Like/pass được lưu tách biệt; `datingMatches` chỉ được tạo khi tồn tại hai lượt like ngược chiều.
- Đây là chế độ ẩn ảnh trong khu vực hẹn hò, không làm ảnh đại diện biến mất khỏi các khu vực công khai khác của ứng dụng.

### Tìm trọ và quán ăn quanh đây

- Vị trí trình duyệt của sinh viên được dùng tạm thời làm tâm tìm kiếm và tính khoảng cách; ứng dụng không ghi tọa độ tìm quán vào Firestore. Google Places nhận tâm tìm kiếm qua Cloud Function khi tính năng nguồn trực tiếp được bật.
- Tọa độ phòng trọ là vị trí công khai của bất động sản, được người đăng chủ động ghim và kiểm tra nằm trong khu vực Trà Vinh mở rộng.
- Tìm trọ theo bán kính dùng các khoảng geohash realtime, gộp kết quả trùng bằng document ID rồi lọc lại bằng Haversine để loại false positive.
- Khoảng cách dùng công thức Haversine và là đường chim bay, không phải quãng đường lái xe.
- Review dùng document xác định theo `loại_địa-điểm_uid`, nên mỗi tài khoản chỉ có một review cho mỗi quán hoặc tin trọ và có thể sửa review đó.
- Dữ liệu quán cộng đồng lấy từ collection `places`; dữ liệu Google Places chỉ tồn tại trong phản hồi hiện tại và được gắn nhãn `Google Maps` theo yêu cầu attribution. Chỉ Place ID được dùng làm khóa liên kết review TVU.
- Nhãn **Sắp mở/Mới mở** chỉ xuất hiện khi nguồn trả `openingDate`. Nhãn **Đang được quan tâm** là điểm xếp hạng minh bạch từ rating và số lượt đánh giá, không được mô tả thành “món bán chạy”.
- Nội dung Google Places không được vẽ lên bản đồ OpenStreetMap; trang chi tiết vẫn hiển thị địa chỉ, khoảng cách và review TVU ngay trong ứng dụng.

### Bản đồ bạn bè và quyền riêng tư vị trí

- Bản đồ nền dùng Leaflet và OpenStreetMap, hiển thị ngay trong TVU Connect. Không có API key bản đồ trong trình duyệt.
- Tọa độ gốc nằm trong `privateLiveLocations`; Firestore Rules chặn toàn bộ truy cập trực tiếp từ client. Callable Function kiểm tra quan hệ rồi mới trả điểm đã làm tròn: khoảng 10 m cho bạn bè, 100 m cho cùng ngành và 1 km cho toàn TVU.
- Người xem phải đang tự chia sẻ vị trí còn hiệu lực mới xem được người khác. Vị trí hết hạn sau 15 phút nếu web không cập nhật; nút **Dừng và xóa vị trí** xóa điểm sống ngay.
- Chạm mặt chỉ được tạo khi cả hai bật cảnh báo, đều cho phép nhau xuất hiện, không chặn nhau, sai số GPS không quá 80 m và khoảng cách ước tính không quá 35 m. ID theo cặp và khung 10 phút cùng transaction Firestore ngăn thông báo trùng khi hai máy cập nhật đồng thời.
- Web chỉ theo dõi khi ứng dụng đang mở. Rung phụ thuộc trình duyệt/thiết bị; thông báo nền dùng Firebase Cloud Messaging.
- Tile công cộng OpenStreetMap phù hợp thử nghiệm và lưu lượng vừa phải. Khi lượng người dùng tăng, cấu hình nhà cung cấp tile có SLA hoặc tự host; không bật tải hàng loạt/offline trên máy chủ tile công cộng.

## Kiểm tra trước khi phát hành

```bash
npm run lint
npm test -- --run
npm run test:rules
npm test --prefix functions
npm run build
```

Các thao tác hẹn hò, tạo cuộc gọi, ghép gọi nhanh và vào phòng học đều đi qua Cloud Functions. Vì vậy, chỉ chạy frontend mới là chưa đủ; rules cũ trên Firebase sẽ gây lỗi quyền truy cập dù giao diện đã được cập nhật.

Đăng nhập đúng tài khoản có quyền quản trị project rồi phát hành đồng bộ backend và frontend:

```bash
npx firebase-tools login --reauth
npx firebase-tools use tvu-connect-1dc97
npx firebase-tools deploy --only firestore:rules,firestore:indexes,functions,hosting --project tvu-connect-1dc97
```

Predeploy của Functions sẽ tự chạy test backend và chặn phát hành nếu test thất bại. Sau deploy, mở app từ hai điện thoại hoặc hai tài khoản thật để kiểm tra thông báo, gọi thoại/video, xung đột cuộc gọi đồng thời, quyền micro/camera, tìm quanh đây và trạng thái tạo index Firestore.

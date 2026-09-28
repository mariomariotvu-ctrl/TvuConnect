#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Dry-run by default. Preserve unrelated settings and reject concurrent edits.
const args = process.argv.slice(2);
if (args.some(arg => !['--publish', '--disable'].includes(arg))) {
  throw new Error('Tuỳ chọn: --publish để bật, --disable --publish để tắt. Bỏ --publish để kiểm tra.');
}
const project = 'tvu-connect-1dc97';
const campaign = JSON.parse(readFileSync(new URL('../config/community-announcement.json', import.meta.url), 'utf8'));
if (!/^[a-zA-Z0-9_-]{1,100}$/.test(campaign.id)
  || typeof campaign.title !== 'string' || !campaign.title.trim() || campaign.title.length > 100
  || typeof campaign.body !== 'string' || !campaign.body.trim() || campaign.body.length > 600) {
  throw new Error('Nội dung thông báo không hợp lệ.');
}
const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const headers = { Authorization: `Bearer ${token}`, 'x-goog-user-project': project };
const endpoint = `https://firebaseremoteconfig.googleapis.com/v1/projects/${project}/remoteConfig`;
const response = await fetch(endpoint, { headers });
const template = await response.json();
if (!response.ok) throw new Error(`Không đọc được Remote Config: ${template.error?.message || response.status}`);
const etag = response.headers.get('etag');
if (!etag) throw new Error('Thiếu ETag, dừng để không ghi đè cấu hình khác.');
const previousVersion = template.version?.versionNumber;
delete template.version;
template.parameters ||= {};

const changes = args.includes('--disable')
  ? { community_announcement_enabled: false }
  : {
    community_announcement_enabled: true,
    community_announcement_id: campaign.id,
    community_announcement_title: campaign.title,
    community_announcement_body: campaign.body,
  };
for (const [key, value] of Object.entries(changes)) {
  const group = Object.values(template.parameterGroups || {}).find(group => key in (group.parameters || {}));
  const parameters = group ? group.parameters : template.parameters;
  // This campaign is for everyone, not an A/B test or conditional audience.
  parameters[key] = {
    defaultValue: { value: String(value) },
    valueType: typeof value === 'boolean' ? 'BOOLEAN' : 'STRING',
    description: 'TVU Connect community toast. Keep the campaign ID to avoid repeats.',
  };
}
const request = {
  method: 'PUT',
  headers: { ...headers, 'Content-Type': 'application/json', 'If-Match': etag },
  body: JSON.stringify(template),
};
const validation = await fetch(`${endpoint}?validateOnly=true`, request);
if (!validation.ok) throw new Error(`Cấu hình không hợp lệ: ${(await validation.json()).error?.message}`);
console.log({ project, previousVersion, changes, validated: true });
if (!args.includes('--publish')) {
  console.log('Chỉ kiểm tra; chưa thay đổi production. Thêm --publish để áp dụng.');
} else {
  const published = await fetch(endpoint, request);
  const result = await published.json();
  if (!published.ok) throw new Error(`Chưa xuất bản: ${result.error?.message || published.status}`);
  console.log(`Đã ${args.includes('--disable') ? 'tắt' : 'bật'} thông báo, Remote Config phiên bản ${result.version?.versionNumber}.`);
}

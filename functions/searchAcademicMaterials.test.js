const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDiscoveryLinks,
  canonicalizeMaterialUrl,
  extractMaterialLinks,
  isMaterialUrl,
  parseDriveReference,
} = require('./searchAcademicMaterials');

test('extracts and deduplicates Drive links copied from a social comment', () => {
  const links = extractMaterialLinks(`
    Chị gửi em các file nhé:
    https://drive.google.com/file/d/book-one/view?usp=sharing
    https://drive.google.com/file/d/book-one/view?usp=sharing
    https://docs.google.com/document/d/book-two/edit?tab=t.0
  `, 'https://www.facebook.com/groups/students/posts/123');

  assert.deepEqual(links.map(({ url, driveFileId }) => ({ url, driveFileId })), [
    { url: 'https://drive.google.com/file/d/book-one/view', driveFileId: 'book-one' },
    { url: 'https://docs.google.com/document/d/book-two/edit', driveFileId: 'book-two' },
  ]);
  assert.equal(links[0].discoveredFrom, 'https://www.facebook.com/groups/students/posts/123');
});

test('unwraps Facebook redirect links and keeps direct academic files', () => {
  const target = 'https://library.example.edu.vn/books/philosophy.pdf';
  const wrapped = `https://l.facebook.com/l.php?u=${encodeURIComponent(target)}&h=abc`;
  assert.equal(canonicalizeMaterialUrl(wrapped), target);
  assert.equal(isMaterialUrl(target), true);
});

test('recognizes Drive folders without pretending they are documents', () => {
  assert.deepEqual(
    parseDriveReference('https://drive.google.com/drive/folders/folder-123?usp=sharing'),
    { fileId: 'folder-123', kind: 'folder' },
  );
  const [folder] = extractMaterialLinks('https://drive.google.com/drive/folders/folder-123?usp=sharing');
  assert.equal(folder.kind, 'folder');
  assert.equal(folder.driveFileId, undefined);
});

test('builds deterministic multi-source discovery searches without AI', () => {
  const links = buildDiscoveryLinks('Triết học Mác Lênin');
  assert.equal(links.length, 4);
  assert.match(decodeURIComponent(links[1].url), /facebook\.com/);
  assert.match(decodeURIComponent(links[2].url), /drive\.google\.com/);
  assert.match(decodeURIComponent(links[3].url), /edu\.vn/);
});

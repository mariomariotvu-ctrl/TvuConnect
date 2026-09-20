import { describe, expect, it } from 'vitest';
import { validateURL } from './urlValidation';

describe('validateURL', () => {
  it('trusts an exact known domain and its subdomains', () => {
    expect(validateURL('https://drive.google.com/file/d/123').isTrusted).toBe(true);
    expect(validateURL('https://library.tvu.edu.vn/book.pdf').isTrusted).toBe(true);
  });

  it('does not trust attacker domains that merely contain a known name', () => {
    expect(validateURL('https://drive.google.com.attacker.example/file.pdf').isTrusted).toBe(false);
    expect(validateURL('https://notedu.vn.example/file.pdf').isTrusted).toBe(false);
  });
});

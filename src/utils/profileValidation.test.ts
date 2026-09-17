import { describe, expect, it } from 'vitest';
import type { StudentProfile } from '../types';
import { validateProfile } from './profileValidation';

const completeProfile = {
  uid: 'student-01',
  email: 'student@tvu.edu.vn',
  mssv: '110121001',
  fullName: 'Nguyễn Văn A',
  className: 'DA21CNTT',
  major: 'Công nghệ thông tin',
  academicYear: '2022-2026',
} as StudentProfile;

describe('validateProfile', () => {
  it('does not require a private phone number to unlock the app', () => {
    expect(validateProfile(completeProfile)).toEqual({
      isComplete: true,
      missingFields: [],
      missingFieldsVN: [],
    });
  });

  it('keeps existing student-id and academic-year formats compatible', () => {
    const result = validateProfile({
      ...completeProfile,
      mssv: 'B2100001',
      academicYear: 'K47',
    });

    expect(result.isComplete).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it('requires only the identity fields used by student discovery', () => {
    const result = validateProfile({
      ...completeProfile,
      mssv: '123',
      major: '',
      academicYear: '',
    });

    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toEqual(['mssv', 'major']);
  });
});

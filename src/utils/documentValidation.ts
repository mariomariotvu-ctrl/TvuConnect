import { DocumentFormData, ValidationError } from '../types/documentLink';
import { validateURL } from './urlValidation';

/**
 * Validate document form data
 * @param data - Form data to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateDocumentForm(data: DocumentFormData): ValidationError[] {
  const errors: ValidationError[] = [];

  // Title validation
  if (!data.title || data.title.trim().length < 3) {
    errors.push({ 
      field: 'title', 
      message: 'Tiêu đề phải có ít nhất 3 ký tự' 
    });
  }
  if (data.title && data.title.length > 200) {
    errors.push({ 
      field: 'title', 
      message: 'Tiêu đề không được vượt quá 200 ký tự' 
    });
  }

  // URL validation
  if (!data.url || !data.url.match(/^https?:\/\/.+/)) {
    errors.push({ 
      field: 'url', 
      message: 'URL phải bắt đầu bằng http:// hoặc https://' 
    });
  } else {
    // Additional URL validation
    const urlValidation = validateURL(data.url);
    if (!urlValidation.isValid) {
      errors.push({ 
        field: 'url', 
        message: 'URL không hợp lệ' 
      });
    }
  }

  // Description validation
  if (data.description && data.description.length > 500) {
    errors.push({ 
      field: 'description', 
      message: 'Mô tả không được vượt quá 500 ký tự' 
    });
  }

  // Required fields
  if (!data.major_id) {
    errors.push({ 
      field: 'major_id', 
      message: 'Vui lòng chọn ngành học' 
    });
  }
  // Subject and Category are now optional (can be empty strings)
  // They will be used for search/filtering but not required for submission

  return errors;
}

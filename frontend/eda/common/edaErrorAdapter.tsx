import {
  ErrorOutput,
  FieldErrorDetail,
  GenericErrorDetail,
} from '@ansible/ansible-ui-framework/PageForm/typesErrorAdapter';
import { isRequestError } from '@ansible/common-ui/crud/RequestError';

/**
 * Recursively flatten a nested error object into dotted field names.
 *
 * Example: `{ inputs: { username: ["required"] } }` produces
 * `[{ name: "inputs.username", message: "required" }]`.
 *
 * This matches how react-hook-form registers nested credential fields
 * (e.g. `inputs.${field.id}`) so that `setError("inputs.username", …)`
 * attaches the message to the correct form control.
 */
function flattenNestedErrors(
  obj: Record<string, unknown>,
  prefix: string,
  fieldErrors: FieldErrorDetail[]
): void {
  for (const key in obj) {
    const qualifiedName = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (Array.isArray(value)) {
      fieldErrors.push({ name: qualifiedName, message: value.join(',') });
    } else if (typeof value === 'object' && value !== null) {
      flattenNestedErrors(value as Record<string, unknown>, qualifiedName, fieldErrors);
    } else {
      fieldErrors.push({ name: qualifiedName, message: String(value) });
    }
  }
}

export const edaErrorAdapter = (error: unknown): ErrorOutput => {
  const genericErrors: GenericErrorDetail[] = [];
  const fieldErrors: FieldErrorDetail[] = [];

  if (isRequestError(error) && error.json && typeof error.json === 'object') {
    const data = error.json;
    for (const key in data) {
      const value = (data as Record<string, unknown>)[key];
      if (key === 'detail') {
        if (Array.isArray(value)) {
          genericErrors.push({ message: value[0] as string });
        } else {
          genericErrors.push({ message: value as string });
        }
      }
      // Check for non-field errors
      else if (key === 'non_field_errors' && Array.isArray(value)) {
        value.forEach((message) => {
          if (typeof message === 'string') {
            genericErrors.push({ message });
          }
        });
      } else if (Array.isArray(value)) {
        const message = value.join(',');
        fieldErrors.push({ name: key, message });
      } else if (typeof value === 'object' && value !== null) {
        // Recursively flatten nested validation errors into dotted field
        // names so they map to react-hook-form controls
        // (e.g. inputs.username).
        flattenNestedErrors(value as Record<string, unknown>, key, fieldErrors);
      } else {
        const message = String(value);
        fieldErrors.push({ name: key, message });
      }
    }
  } else if (error instanceof Error) {
    genericErrors.push({ message: error.message });
  }

  return { genericErrors, fieldErrors };
};

export function useEdaErrorMessageParser() {
  return (
    error: Error,
    unknownErrorMessage?: string
  ): { message: string; parsedErrors: (GenericErrorDetail | FieldErrorDetail)[] } => {
    const { genericErrors, fieldErrors } = edaErrorAdapter(error);
    const parsedErrors = [
      ...genericErrors,
      ...fieldErrors.filter((e) => e.message).map(({ message }) => ({ message })),
    ];
    const message =
      typeof parsedErrors[0]?.message === 'string' && parsedErrors.length === 1
        ? parsedErrors[0].message
        : unknownErrorMessage
          ? unknownErrorMessage
          : `Unknown error`;
    return { message, parsedErrors };
  };
}

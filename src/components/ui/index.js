/**
 * UI primitives — barrel export.
 *
 * Lets a screen write one import instead of eight. Components are still
 * defined in their own files; this only collects them.
 *
 * @module components/ui
 */

export { Button } from './button.js';
export { Field, fieldId } from './field.js';
export { Input, InputStatus } from './input.js';
export { PinInput } from './pin-input.js';
export { Select, OptionGroup } from './select.js';
export { openModal, confirmModal } from './modal.js';
export { toast, toastSuccess, toastError, toastInfo, clearToasts } from './toast.js';
export {
  Card,
  Badge,
  Avatar,
  Spinner,
  Skeleton,
  SkeletonText,
  EmptyState,
  Switch,
} from './primitives.js';

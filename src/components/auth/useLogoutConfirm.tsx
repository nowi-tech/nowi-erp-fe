import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/auth';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/**
 * Logout-with-confirmation. Returns `requestLogout` (open the prompt) and a
 * `dialog` node to render once. Confirm → real logout; cancel → go Home (`/`).
 *
 * Shared by every shell so the "Are you sure?" step lives in one place
 * instead of being re-implemented per logout button.
 */
export function useLogoutConfirm(): {
  requestLogout: () => void;
  dialog: ReactNode;
} {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const dialog = (
    <ConfirmDialog
      open={open}
      title={t('common.logoutConfirm.title', { defaultValue: 'Log out?' })}
      message={t('common.logoutConfirm.message', {
        defaultValue: 'Are you sure you want to log out?',
      })}
      confirmLabel={t('common.logoutConfirm.confirm', {
        defaultValue: 'Yes, log out',
      })}
      cancelLabel={t('common.logoutConfirm.cancel', {
        defaultValue: 'No, go to home',
      })}
      destructive
      onConfirm={() => {
        setOpen(false);
        void logout();
      }}
      onCancel={() => {
        setOpen(false);
        navigate('/');
      }}
    />
  );

  return { requestLogout: () => setOpen(true), dialog };
}

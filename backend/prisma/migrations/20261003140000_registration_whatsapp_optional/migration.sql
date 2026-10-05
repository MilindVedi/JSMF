-- The registration form no longer asks for a WhatsApp number.
--
-- Nothing sends WhatsApp or SMS for a session, so a number collected for a
-- message that never goes out is personal data held for no reason. The column
-- stays so the numbers already given are not destroyed; it simply stops being
-- filled in.

ALTER TABLE "session_registrations" ALTER COLUMN "whatsapp_number" DROP NOT NULL;

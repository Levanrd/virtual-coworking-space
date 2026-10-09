import nodemailer from 'nodemailer';

export function createMailer(env = process.env) {
  if (!env.SMTP_HOST) return null;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === 'true',
    requireTLS: env.NODE_ENV === 'production',
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  return ({ to, subject, text }) => transport.sendMail({
    from: env.MAIL_FROM || 'Common Ground <hello@localhost.test>', to, subject, text,
  });
}

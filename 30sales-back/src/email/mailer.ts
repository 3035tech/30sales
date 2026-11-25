import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { Logger } from '@nestjs/common';

const sesClient = new SESv2Client({ region: 'us-west-2' });
const sender = 'info@3035tech.com';
const emailLogger = new Logger('ProductEmail');

export async function sendProductEmail(input: { to: string; subject: string; text: string; html: string }): Promise<void> {
 try {
  await sesClient.send(new SendEmailCommand({
   FromEmailAddress: sender,
   Destination: { ToAddresses: [input.to] },
   Content: {
    Simple: {
     Subject: { Data: input.subject, Charset: 'UTF-8' },
     Body: {
      Text: { Data: input.text, Charset: 'UTF-8' },
      Html: { Data: input.html, Charset: 'UTF-8' },
     },
    },
   },
  }));
 } catch (error) {
  const errorType = error instanceof Error ? error.name : 'UnknownError';
  emailLogger.error(`SES email submission failed (${errorType}).`);
  throw error;
 }
}

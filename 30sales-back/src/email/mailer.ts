import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const sesClient = new SESv2Client({ region: 'us-west-2' });
const sender = 'info@3035tech.com';

export async function sendProductEmail(input: { to: string; subject: string; text: string; html: string }): Promise<void> {
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
}

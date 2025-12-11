import { Resend } from "resend";
import { PulseBoardAPI } from "../api";
import { Database } from "../../database.types";

type Endpoint = Database["public"]["Tables"]["endpoints"]["Row"];

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

export async function sendNotification(
    endpoint: Endpoint,
    type: "failure" | "recovery",
    errorMessage?: string
) {
    try {
        // 1. Get User Email
        const email = await PulseBoardAPI.getUserEmail(endpoint.user_id);

        if (!email) {
            console.error(`❌ No email found for user ${endpoint.user_id}`);
            return;
        }

        // 2. Check Cooldown (Only for failures)
        if (type === "failure") {
            const cooldownSeconds = endpoint.notification_cooldown_seconds || 3600;
            const shouldSend = await PulseBoardAPI.shouldSendFailureNotification(endpoint.id, cooldownSeconds);

            if (!shouldSend) {
                console.log(`Hz Skipping notification for ${endpoint.name} (Cooldown)`);
                return;
            }
        }

        // 3. Send Email
        const subject = type === "failure"
            ? `🚨 Endpoint Down: ${endpoint.name}`
            : `✅ Endpoint Recovered: ${endpoint.name}`;

        const { error: emailError } = await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: subject,
            html: `
        <div>
          <h2>${subject}</h2>
          <p><strong>URL:</strong> ${endpoint.url}</p>
          ${errorMessage ? `<p><strong>Error:</strong> ${errorMessage}</p>` : ""}
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
      `,
        });

        if (emailError) {
            console.error("Error sending email:", emailError);
            return;
        }

        // 4. Log Notification to DB
        await PulseBoardAPI.logNotification({
            endpoint_id: endpoint.id,
            notification_type: type,
            recipient_email: email,
        });

        console.log(`📧 Sent ${type} notification for ${endpoint.name}`);

    } catch (err) {
        console.error("Notification failed:", err);
    }
}
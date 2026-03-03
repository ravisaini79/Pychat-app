import smtplib
import random
import string
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from .config import settings


def generate_otp(length: int = 6) -> str:
    """Generate a random numeric OTP."""
    return "".join(random.choices(string.digits, k=length))


def send_otp_email(to_email: str, otp_code: str) -> bool:
    """Send an OTP email using Gmail SMTP. Returns True on success."""
    smtp_email = settings.SMTP_EMAIL
    smtp_password = settings.SMTP_PASSWORD

    if not smtp_email or not smtp_password:
        raise RuntimeError(
            "SMTP_EMAIL and SMTP_PASSWORD must be set in .env for password reset"
        )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your Password Reset OTP"
    msg["From"] = smtp_email
    msg["To"] = to_email

    html_body = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto;
                padding: 32px; background: #18181d; color: #e8e8ed; border-radius: 12px;">
        <h2 style="margin: 0 0 16px; color: #818cf8;">Password Reset</h2>
        <p style="margin: 0 0 24px; color: #8b8b96;">
            Use the following code to reset your password. This code expires in 10 minutes.
        </p>
        <div style="background: #0f0f12; padding: 20px; border-radius: 8px; text-align: center;
                    font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #6366f1;
                    border: 1px solid #2d2d35;">
            {otp_code}
        </div>
        <p style="margin: 24px 0 0; color: #8b8b96; font-size: 13px;">
            If you didn't request this, please ignore this email.
        </p>
    </div>
    """
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_email, smtp_password)
            server.sendmail(smtp_email, to_email, msg.as_string())
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] Failed to send OTP to {to_email}: {e}")
        return False

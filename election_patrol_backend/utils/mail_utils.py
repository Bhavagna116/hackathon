import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List
from dotenv import load_dotenv

load_dotenv()

# Config
def send_alert_email(to_emails: List[str], incident_type: str, latitude: float, longitude: float, severity: str, reported_by: str):
    """Send an alert email to a list of officers."""
    SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER")
    SMTP_PASS = os.getenv("SMTP_PASS")

    if not SMTP_USER or not SMTP_PASS:
        print(f"Skipping email send: Missing SMTP configuration.")
        return
    if not to_emails:
        print("Skipping email send: No recipients found.")
        return
    
    print(f"DEBUG: Attempting to send email from {SMTP_USER} to {to_emails}")


    msg = MIMEMultipart()
    msg['From'] = f"Election Patrol <{SMTP_USER}>"
    msg['To'] = ", ".join(to_emails)
    msg['Subject'] = f"EMERGENCY ALERT: {incident_type.upper()} - {severity.upper()} SEVERITY"

    body = f"""
    <h2>Election Patrol Emergency Alert</h2>
    <p>A new emergency incident has been reported and you are one of the closest officers in the area.</p>
    <hr/>
    <ul>
        <li><b>Incident Type:</b> {incident_type}</li>
        <li><b>Severity:</b> {severity}</li>
        <li><b>Location:</b> {latitude}, {longitude}</li>
        <li><b>Reported By:</b> {reported_by}</li>
    </ul>
    <p>Please check your Election Patrol mobile app for more details and to respond to this incident.</p>
    <br/>
    <p><i>Regards,<br/>Election Patrol Dashboard</i></p>
    """

    msg.attach(MIMEText(body, 'html'))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            
            for email in to_emails:
                try:
                    # Recreate msg or update to for each recipient
                    # better to recreate for each to avoid side effects
                    msg = MIMEMultipart()
                    msg['From'] = f"Election Patrol <{SMTP_USER}>"
                    msg['To'] = email
                    msg['Subject'] = f"EMERGENCY ALERT: {incident_type.upper()} - {severity.upper()} SEVERITY"
                    msg.attach(MIMEText(body, 'html'))
                    
                    server.send_message(msg)
                    print(f"DEBUG: Alert email sent successfully to {email}")
                except Exception as inner_e:
                    print(f"ERROR: Failed to send email to {email}: {inner_e}")
        
    except Exception as e:
        print(f"CRITICAL: SMTP connection failed for {SMTP_USER}: {e}")


from dataclasses import dataclass

import httpx

from .config import Settings
from .errors import AuthError


@dataclass(frozen=True)
class OTPDelivery:
    mode: str
    development_code: str | None = None


async def deliver_otp(phone_number: str, code: str, settings: Settings) -> OTPDelivery:
    if settings.sms_provider_url:
        if not settings.sms_api_key:
            raise AuthError(503, "SMS_NOT_CONFIGURED", "Patient verification is unavailable until SMS credentials are configured.")
        headers = {"Authorization": f"Bearer {settings.sms_api_key}", "Content-Type": "application/json"}
        payload = {
            "to": phone_number,
            "from": settings.sms_sender,
            "message": f"Your VisitWeave verification code is {code}. It expires soon.",
        }
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.post(settings.sms_provider_url, json=payload, headers=headers)
                response.raise_for_status()
        except (httpx.HTTPError, ValueError):
            raise AuthError(503, "SMS_DELIVERY_FAILED", "We could not deliver a verification code. Please try again later.") from None
        return OTPDelivery(mode=settings.sms_provider or "configured-provider")

    if settings.environment.lower() == "development" and not settings.sms_provider:
        return OTPDelivery(mode="development", development_code=code)

    raise AuthError(503, "SMS_NOT_CONFIGURED", "Patient verification is unavailable because no SMS provider is configured.")

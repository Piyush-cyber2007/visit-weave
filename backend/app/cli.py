import argparse
import asyncio
import getpass
import hmac
import os
import re

from sqlalchemy.exc import IntegrityError

from .auth_service import provision_doctor
from .config import get_settings
from .database import create_engine, create_session_factory


async def create_doctor_account(args: argparse.Namespace) -> None:
    settings = get_settings()
    provisioning_key = settings.doctor_provisioning_key
    if not provisioning_key:
        raise SystemExit("Set DOCTOR_PROVISIONING_KEY in the environment before provisioning a doctor.")
    supplied_key = os.environ.get("DOCTOR_PROVISIONING_KEY", provisioning_key)
    if not supplied_key or not hmac.compare_digest(supplied_key, provisioning_key):
        raise SystemExit("Doctor provisioning authorization failed.")

    email = args.email.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise SystemExit("A valid doctor email is required.")
    password = getpass.getpass("Initial doctor password (minimum 12 characters): ")
    if len(password) < 12:
        raise SystemExit("Doctor password must be at least 12 characters.")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        raise SystemExit("Passwords did not match.")

    engine = create_engine(settings)
    session_factory = create_session_factory(engine)
    try:
        async with session_factory() as session:
            session.add(provision_doctor(email, password, args.name, args.department, args.specialization))
            try:
                await session.commit()
            except IntegrityError:
                await session.rollback()
                raise SystemExit("A user with that email already exists.") from None
    finally:
        await engine.dispose()
    print(f"Provisioned doctor account for {email}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Provision controlled VisitWeave doctor accounts.")
    commands = parser.add_subparsers(dest="command", required=True)
    doctor = commands.add_parser("create-doctor", help="Create a doctor account (requires a provisioning key).")
    doctor.add_argument("--email", required=True)
    doctor.add_argument("--name", required=True)
    doctor.add_argument("--department")
    doctor.add_argument("--specialization")
    args = parser.parse_args()
    if args.command == "create-doctor":
        asyncio.run(create_doctor_account(args))


if __name__ == "__main__":
    main()

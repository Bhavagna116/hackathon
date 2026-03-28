import os
from datetime import datetime, timedelta

from fastapi import HTTPException
from jose import JWTError, jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    secret = os.environ.get("JWT_SECRET")
    algorithm = os.environ.get("JWT_ALGORITHM", "HS256")
    expire_minutes = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    if not secret:
        raise RuntimeError("JWT_SECRET is not set")

    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=expire_minutes)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, secret, algorithm=algorithm)


def decode_access_token(token: str) -> dict:
    secret = os.environ.get("JWT_SECRET")
    algorithm = os.environ.get("JWT_ALGORITHM", "HS256")
    if not secret:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    try:
        return jwt.decode(token, secret, algorithms=[algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

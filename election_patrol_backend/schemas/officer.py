from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, model_validator


class OfficerRegister(BaseModel):
    name: str
    username: str
    email: EmailStr
    password: str = Field(..., min_length=8)
    confirm_password: str
    mobile_number: str

    @model_validator(mode="after")
    def check_passwords_match(self) -> "OfficerRegister":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        
        pw = self.password
        if not any(char.isupper() for char in pw):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(char.islower() for char in pw):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(char.isdigit() for char in pw):
            raise ValueError("Password must contain at least one number")
        special_chars = set("!@#$%^&*()-_=+[]{}|;:',.<>?/")
        if not any(char in special_chars for char in pw):
            raise ValueError("Password must contain at least one special character")
        return self

class OfficerPasswordReset(BaseModel):
    identifier: str  # Either email or username
    new_password: str = Field(..., min_length=8)
    confirm_password: str

    @model_validator(mode="after")
    def check_passwords_match(self) -> "OfficerPasswordReset":
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")
        
        pw = self.new_password
        if not any(char.isupper() for char in pw):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(char.islower() for char in pw):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(char.isdigit() for char in pw):
            raise ValueError("Password must contain at least one number")
        special_chars = set("!@#$%^&*()-_=+[]{}|;:',.<>?/")
        if not any(char in special_chars for char in pw):
            raise ValueError("Password must contain at least one special character")
        return self


class OfficerLogin(BaseModel):
    username: str
    password: str


class OfficerResponse(BaseModel):
    unique_id: str
    username: str
    email: EmailStr
    rank: str
    mobile_number: str
    full_name: Optional[str] = None
    fcm_token: Optional[str] = None
    availability_status: str = "free"
    last_latitude: Optional[float] = None
    last_longitude: Optional[float] = None
    last_updated: Optional[datetime] = None
    created_at: datetime


class FCMTokenUpdate(BaseModel):
    fcm_token: str

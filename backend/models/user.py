from pydantic import BaseModel
from typing import Optional

class UserLogin(BaseModel):
    username: str
    password: str

class UserRequest(BaseModel):
    username: str
    password: str
    role: str = "dispatcher"
    department: str
    reason: str

class AccessApproval(BaseModel):
    username: str
    approved: bool

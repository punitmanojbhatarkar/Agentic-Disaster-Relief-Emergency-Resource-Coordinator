import os
from sqlalchemy import create_engine, Column, Integer, Text
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./local_state.db")

# If using sqlite, check_same_thread=False is needed for FastAPI
connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class GlobalState(Base):
    __tablename__ = "global_state"
    id = Column(Integer, primary_key=True, index=True)
    state_json = Column(Text, nullable=False)

# Create tables
Base.metadata.create_all(bind=engine)

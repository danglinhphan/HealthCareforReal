from db.db import engine
from sqlmodel import SQLModel, Field, Session, select
import json
from datetime import datetime
from typing import Optional


class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"
    conversation_id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int
    timestamp: str
    messages: str

def create_conversation(user_id, first_message):
    timestamp = datetime.utcnow().isoformat()
    messages = json.dumps([{"role": "user", "content": first_message, "timestamp": timestamp}])
    with Session(engine) as session:
        conversation = Conversation(user_id=user_id, timestamp=timestamp, messages=messages)
        session.add(conversation)
        session.commit()
        session.refresh(conversation)
        return {
            "conversation_id": conversation.conversation_id,
            "user_id": user_id,
            "timestamp": timestamp,
            "messages": json.loads(messages)
        }

def get_conversation(conversation_id, user_id):
    with Session(engine) as session:
        statement = select(Conversation).where(
            Conversation.conversation_id == conversation_id,
            Conversation.user_id == user_id
        )
        result = session.exec(statement).first()
        if result:
            return {
                "conversation_id": result.conversation_id,
                "user_id": result.user_id,
                "timestamp": result.timestamp,
                "messages": json.loads(result.messages)
            }
        return None

def delete_conversation(conversation_id, user_id) -> bool:
    with Session(engine) as session:
        statement = select(Conversation).where(
            Conversation.conversation_id == conversation_id,
            Conversation.user_id == user_id
        )
        conversation = session.exec(statement).first()
        if not conversation:
            return False
        session.delete(conversation)
        session.commit()
        return True
from fastapi import APIRouter, HTTPException, status, Request, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from tasksapi.crud.user import create_user, verify_user_login, get_user_by_username, UserCreate, UserLogin, save_user_token, clear_user_token
from tasksapi.utils.utils import create_access_token, get_current_user
from pydantic import BaseModel
from tasksapi.crud.conversations import create_conversation, get_conversation, delete_conversation
from google import genai
from google.genai import types
from datetime import datetime
from db.db import engine
from sqlmodel import Session, select
from tasksapi.crud.conversations import Conversation as ConversationModel
from fastapi import Path
import json
import asyncio
import os
from config import settings

router = APIRouter()

# Use settings from config
MODEL = settings.gemini_model

# Configure Gemini API with settings
client = genai.Client(api_key=settings.gemini_api_key)


async def get_current_user_info(current_user: str = Depends(get_current_user)):
    """Get current user information"""
    try:
        user_info = get_user_by_username(current_user)
        if user_info:
            # Remove password from response but keep token
            user_info_dict = {
                "user_id": user_info['user_id'],
                "username": user_info['username'],
                "emailaddress": user_info['emailaddress']
            }
            return {"user": user_info_dict}
        else:
            raise HTTPException(status_code=404, detail="User not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def register_user(user_data: UserCreate):
    try:
        # Basic validation
        if len(user_data.username) < 3:
            raise HTTPException(status_code=400, detail="Username must be at least 3 characters long")
        
        if len(user_data.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")
        
        # Check if user already exists
        existing_user = get_user_by_username(user_data.username)
        if existing_user:
            raise HTTPException(status_code=400, detail="Username already exists")
        
        result = create_user(user_data)
        
        if result:
            return {"message": "User registered successfully", "user": result}
        else:
            raise HTTPException(status_code=500, detail="Failed to register user")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def login_user(login_data: UserLogin):
    try:
        result = verify_user_login(login_data.username, login_data.password)
        
        if result:
            # Create access token
            access_token = create_access_token(
                data={"sub": result["username"], "user_id": result["user_id"]}
            )
            
            # Save token to database
            save_user_token(result["user_id"], access_token)
            
            return {
                "message": "Login successful",
                "user": result,
                "access_token": access_token,
                "token_type": "bearer"
            }
        else:
            raise HTTPException(status_code=401, detail="Invalid username or password")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def logout_user(current_user: str = Depends(get_current_user)):
    """Logout user by clearing their token"""
    try:
        user_info = get_user_by_username(current_user)
        if user_info:
            # Clear token from database
            clear_user_token(user_info["user_id"])
            return {"message": "Logout successful"}
        else:
            raise HTTPException(status_code=404, detail="User not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ConversationCreateRequest(BaseModel):
    first_message: str

class ConversationResponse(BaseModel):
    conversation_id: int
    user_id: int
    timestamp: str
    messages: list

@router.get("/conversations")
async def get_user_conversations(
    current_username: str = Depends(get_current_user)
):
    user = get_user_by_username(current_username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    try:
        with Session(engine) as session:
            statement = select(ConversationModel).where(
                ConversationModel.user_id == user["user_id"]
            ).order_by(ConversationModel.timestamp.desc())
            conversations = session.exec(statement).all()
            
            result = []
            for conv in conversations:
                # Parse messages to get first message
                messages = json.loads(conv.messages) if conv.messages else []
                first_message = ""
                if messages:
                    # Find first user message
                    for msg in messages:
                        if msg.get("role") == "user":
                            first_message = msg.get("content", "")
                            break
                
                result.append({
                    "conversation_id": conv.conversation_id,
                    "user_id": conv.user_id,
                    "timestamp": conv.timestamp.isoformat(),
                    "first_message": first_message
                })
            
            return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching conversations: {str(e)}")

@router.post("/conversations", response_model = ConversationResponse)
async def start_conversation(
    request: ConversationCreateRequest,
    current_username: str = Depends(get_current_user)
):
    user = get_user_by_username(current_username)
    if not user:
        raise HTTPException(status_code = 404, detail = "User not found")

    conv = create_conversation(user_id = user["user_id"], first_message = request.first_message)

    try:
        gemini_response = client.models.generate_content(
            model=MODEL,
            contents=request.first_message,
            config=types.GenerateContentConfig()
        )

        conv["messages"].append({
            "role": "assistant",
            "content": gemini_response.text,
            "timestamp": datetime.utcnow().isoformat()
        })

        with Session(engine) as session:
            statement = select(ConversationModel).where(
                ConversationModel.conversation_id == conv["conversation_id"],
                ConversationModel.user_id == user["user_id"]
            )
            db_conv = session.exec(statement).first()
            if db_conv:
                db_conv.messages = json.dumps(conv["messages"])
                session.add(db_conv)
                session.commit()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API error: {str(e)}")

    return conv

@router.get("/conversations/{conversation_id}", response_model = ConversationResponse)
async def read_conversation(
    conversation_id: int,
    current_username: str = Depends(get_current_user)
):
    user = get_user_by_username(current_username)
    if not user:
        raise HTTPException(status_code = 404, detail = "User not found")
    
    conv = get_conversation(conversation_id, user["user_id"])
    if not conv:
        raise HTTPException(status_code = 404, detail = "Conversation not found")
    
    return conv

@router.delete("/conversations/{conversation_id}")
async def delete_conversation_endpoint(
    conversation_id: int,
    current_username: str = Depends(get_current_user)
):

    user = get_user_by_username(current_username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    success = delete_conversation(conversation_id, user["user_id"])
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found or cannot delete")

    return {"message": "Conversation deleted successfully"}


class MessageRequest(BaseModel):
    content: str

@router.post("/conversations/{conversation_id}/messages", response_model=ConversationResponse)
async def add_message_to_conversation(
    conversation_id: int = Path(...),
    request: MessageRequest = None,
    current_username: str = Depends(get_current_user)
):
    user = get_user_by_username(current_username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    conv = get_conversation(conversation_id, user["user_id"])
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv["messages"].append({
        "role": "user",
        "content": request.content,
        "timestamp": datetime.utcnow().isoformat()
    })

    history_prompt = "\n".join(f"{m['role']}: {m['content']}" for m in conv["messages"])
    
    try:
        gemini_response = client.models.generate_content(
            model=MODEL,
            contents=history_prompt,
            config=types.GenerateContentConfig()
        )

        conv["messages"].append({
            "role": "assistant",
            "content": gemini_response.text,
            "timestamp": datetime.utcnow().isoformat()
        })

        with Session(engine) as session:
            statement = select(ConversationModel).where(
                ConversationModel.conversation_id == conversation_id,
                ConversationModel.user_id == user["user_id"]
            )
            db_conv = session.exec(statement).first()
            if db_conv:
                db_conv.messages = json.dumps(conv["messages"])
                session.add(db_conv)
                session.commit()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API error: {str(e)}")

    return conv

@router.post("/conversations/{conversation_id}/messages/stream")
async def add_message_to_conversation_stream(
    conversation_id: int = Path(...),
    request: MessageRequest = None,
    current_username: str = Depends(get_current_user)
):
    print(f"[DEBUG] Streaming endpoint called for conversation {conversation_id}")
    user = get_user_by_username(current_username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    conv = get_conversation(conversation_id, user["user_id"])
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    print(f"[DEBUG] User message: {request.content}")
    # Add user message to conversation
    user_message = {
        "role": "user",
        "content": request.content,
        "timestamp": datetime.utcnow().isoformat()
    }
    conv["messages"].append(user_message)

    # Prepare history for Gemini
    history_prompt = "\n".join(f"{m['role']}: {m['content']}" for m in conv["messages"])
    print(f"[DEBUG] History prompt: {history_prompt}")

    async def generate_stream():
        try:
            print("[DEBUG] Starting streaming generation")
            # Send user message first
            yield f"data: {json.dumps({'type': 'user_message', 'message': user_message})}\n\n"
            
            # Start assistant message
            assistant_message = {
                "role": "assistant",
                "content": "",
                "timestamp": datetime.utcnow().isoformat()
            }
            yield f"data: {json.dumps({'type': 'assistant_start', 'message': assistant_message})}\n\n"
            
            print("[DEBUG] Calling Gemini API with streaming")
            # Generate streaming response from Gemini
            config = types.GenerateContentConfig()
            gemini_response = client.models.generate_content(
                model=MODEL,
                contents=history_prompt,
                config=config
            )
            
            # Since the library doesn't support streaming directly, we'll simulate it
            response_text = gemini_response.text
            
            print("[DEBUG] Starting to process chunks from Gemini")
            full_content = ""
            chunk_count = 0
            
            # Simulate streaming by sending the response in chunks
            import time
            words = response_text.split()
            chunk_size = 3  # Send 3 words at a time
            
            for i in range(0, len(words), chunk_size):
                chunk_words = words[i:i + chunk_size]
                chunk_text = " ".join(chunk_words)
                if i + chunk_size < len(words):
                    chunk_text += " "
                
                chunk_count += 1
                print(f"[DEBUG] Processing chunk {chunk_count}: {chunk_text[:50]}...")
                full_content += chunk_text
                yield f"data: {json.dumps({'type': 'assistant_chunk', 'content': chunk_text})}\n\n"
                
                # Small delay to simulate streaming
                await asyncio.sleep(0.1)
            
            print(f"[DEBUG] Completed processing {chunk_count} chunks. Full content length: {len(full_content)}")
            
            # Complete assistant message
            assistant_message["content"] = full_content
            conv["messages"].append(assistant_message)
            
            print("[DEBUG] Saving to database")
            # Save to database
            with Session(engine) as session:
                statement = select(ConversationModel).where(
                    ConversationModel.conversation_id == conversation_id,
                    ConversationModel.user_id == user["user_id"]
                )
                db_conv = session.exec(statement).first()
                if db_conv:
                    db_conv.messages = json.dumps(conv["messages"])
                    session.add(db_conv)
                    session.commit()
            
            print("[DEBUG] Database save complete, sending completion signals")
            # Send completion signal
            yield f"data: {json.dumps({'type': 'assistant_complete', 'message': assistant_message})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            print("[DEBUG] Streaming complete")
            
        except Exception as e:
            print(f"[ERROR] Exception in streaming function: {str(e)}")
            import traceback
            print(f"[ERROR] Traceback: {traceback.format_exc()}")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

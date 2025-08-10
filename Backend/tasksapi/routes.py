from fastapi import APIRouter
from tasksapi.controllers import *

router = APIRouter()

router.post("/register")(register_user)
router.post("/login")(login_user)
router.post("/logout")(logout_user)
router.get("/me")(get_current_user_info)
router.get("/conversations")(get_user_conversations)
router.post("/conversations")(start_conversation) 
router.get("/conversations/{conversation_id}")(read_conversation)
router.delete("/conversations/{conversation_id}")(delete_conversation_endpoint)
router.post("/conversations/{conversation_id}/messages")(add_message_to_conversation)
router.post("/conversations/{conversation_id}/messages/stream")(add_message_to_conversation_stream)

import streamlit as st
import backend as demo

st.set_page_config(page_title="BEPEC RAG Chatbot", page_icon="📌", layout="centered")
st.title("📌 BEPEC RAG Chatbot")
st.caption("RAG + LangChain grounded in the BEPEC website")


# Built once per server session, reused across reruns/users.
@st.cache_resource(show_spinner="Indexing the BEPEC website...")
def get_retriever():
    return demo.build_retriever()

retriever = get_retriever()

with st.sidebar:
    st.header("Controls")
    if st.button("Clear Conversation", use_container_width=True):
        st.session_state.memory = demo.demo_memory()
        st.session_state.chat_history = []
        st.rerun()

    if st.button("Re-index website", use_container_width=True):
        get_retriever.clear()   # drop the cache so it rescrapes
        st.rerun()

    st.divider()
    st.markdown(
        "**About**\n\n"
        "- Retrieval-augmented over bepec.in\n"
        "- Few-shot + chat memory\n"
        "- Model: `gpt-4o-mini`"
    )

if "memory" not in st.session_state:
    st.session_state.memory = demo.demo_memory()
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

for message in st.session_state.chat_history:
    with st.chat_message(message["role"]):
        st.markdown(message["text"])

input_text = st.chat_input("Ask about BEPEC courses, placements, fees...")
if input_text:
    with st.chat_message("user"):
        st.markdown(input_text)
    st.session_state.chat_history.append({"role": "user", "text": input_text})

    with st.chat_message("assistant"):
        with st.spinner("Thinking..."):
            response, updated_memory = demo.demo_conversation(
                input_text=input_text,
                memory=st.session_state.memory,
                retriever=retriever,
            )
        st.markdown(response)

    st.session_state.memory = updated_memory
    st.session_state.chat_history.append({"role": "assistant", "text": response})
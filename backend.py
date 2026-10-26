import os
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.document_loaders import WebBaseLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_core.chat_history import InMemoryChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.runnables import RunnablePassthrough
from langchain_core.prompts import (
    ChatPromptTemplate,
    FewShotChatMessagePromptTemplate,
    MessagesPlaceholder,
)

load_dotenv()

BEPEC_URLS = [
    "https://www.bepec.in/",
    "https://bepec.in/ai-training-for-working-professionals/",
    "https://bepec.in/live-classes-with-internship/",
    
]

def demo_chatbot():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError(
            "OPENAI_API_KEY not found. Create a .env file with: "
            "OPENAI_API_KEY=your_key_here"
        )
    return ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0.3,
        api_key=api_key,
        max_tokens=1024,
    )

def build_retriever(urls=BEPEC_URLS, k=4):
    
    loader = WebBaseLoader(urls)
    docs = loader.load()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=150,
    )
    chunks = splitter.split_documents(docs)

    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    vectorstore = InMemoryVectorStore.from_documents(chunks, embeddings)

    return vectorstore.as_retriever(search_kwargs={"k": k})

def format_docs(docs):
    return "\n\n".join(d.page_content for d in docs)

examples = [
    {
        "input": "Who are you?",
        "output": "I'm the BEPEC assistant. I help you with questions about our "
                  "AI, Data Science, and Data Engineering courses, placements, and careers.",
    },
    {
        "input": "I'm from a non-IT background. Can I learn AI?",
        "output": "Absolutely. Many BEPEC learners come from non-IT backgrounds. "
                  "We start from fundamentals and take you to job-ready, step by step.",
    },
]

example_prompt = ChatPromptTemplate.from_messages(
    [("human", "{input}"), ("ai", "{output}")]
)
few_shot_prompt = FewShotChatMessagePromptTemplate(
    example_prompt=example_prompt,
    examples=examples,
)

CHAT_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are a helpful, friendly AI assistant built by BEPEC Solutions. "
            "Answer using the BEPEC website context below. If the answer isn't in "
            "the context, say you're not sure and suggest contacting BEPEC directly — "
            "don't make things up. Match the tone of the examples & For More Queries, Reach BEPEC Team: +919644466222\n\n"
            "BEPEC website context:\n{context}",
        ),
        few_shot_prompt,
        MessagesPlaceholder(variable_name="history"),
        ("human", "{input}"),
    ]
)

def demo_memory():
    return InMemoryChatMessageHistory()

def demo_conversation(input_text, memory, retriever):
    
    llm = demo_chatbot()

    
    rag_chain = (
        RunnablePassthrough.assign(
            context=lambda x: format_docs(retriever.invoke(x["input"]))
        )
        | CHAT_PROMPT
        | llm
    )

    chat_with_history = RunnableWithMessageHistory(
        rag_chain,
        lambda session_id: memory,
        input_messages_key="input",
        history_messages_key="history",
    )

    try:
        result = chat_with_history.invoke(
            {"input": input_text},
            config={"configurable": {"session_id": "bepec-session"}},
        )
        chat_reply = result.content
    except Exception as e:
        chat_reply = f"Sorry, something went wrong: {str(e)}"

    return chat_reply, memory
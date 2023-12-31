import io, { Socket } from "socket.io-client";
import { FormEvent, useEffect, useRef, useState } from "react"
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const SOCKET_URL = process.env.NEXT_PUBLIC_URL || "ws://127.0.0.1";

const CONNECTION_COUNT_UPDATED_CHANNEL = "chat:connection-count-updated"
const NEW_MESSAGE_CHANNEL = "chat:new-message"

type Message = {
    message: string,
    id: string,
    createdAt: string,
    port: string,
}

function useSocket() {
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        const socketIo = io(SOCKET_URL, {
            reconnection: true,
            upgrade: true,
            transports: ["websocket", "polling"],
        })
        setSocket(socketIo)

        return () => {
            socketIo.disconnect()
        }
    }, [])

    return socket
}

export default function Home() {

    const messageListRef = useRef<HTMLOListElement | null>(null);
    const [newMessage, setNewMessage] = useState('')
    const [connectionCount, setConnectionCount] = useState(0);
    const [messages, setMessages] = useState<Message[]>([])
    const socket = useSocket();

    useEffect(() => {
        socket?.on("connect", () => {
            console.log("connected");
        })

        socket?.on(NEW_MESSAGE_CHANNEL, (message: Message) => {
            setMessages((messages) => [...messages, message])
            setTimeout(() => {
                scrollToBottom();
            }, 0);
        })

        socket?.on(
            CONNECTION_COUNT_UPDATED_CHANNEL,
            ({ count }: { count: number }) => {
                setConnectionCount(count);
            }
        );

    }, [socket])

    function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setNewMessage('')

        socket?.emit("message", {
            message: newMessage,
        })
    }

    function scrollToBottom() {
        if (messageListRef.current) {
            messageListRef.current.scrollTop = messageListRef.current.scrollHeight + 1000;
        }
    }

    return (
        <main className="flex flex-col p-4 w-full max-w-3xl m-auto">
            <div className="relative bg-gray-200">
                <h1 className="text-4xl mt-4font-bold text-center mb-4">Chat </h1>
                <div className="absolute right-2 top-3">
                    User Count: {connectionCount}
                </div>    
            </div>
            <ol className="flex-1 overflow-y-scroll overflow-x-hidden" ref={messageListRef}>
                {
                    messages.map((message) => (
                        <li key={message.id} className="bg-gray-100 rounded-lg p-4 my-2 break-all">
                            <p className="text-small text-gray-500">PORT: {message.port}</p>
                            {message.message}
                        </li>
                    ))
                }
            </ol>
            <form onSubmit={handleSubmit} className="flex items-center">
                <Textarea
                    className="rounded-lg mr-4"
                    placeholder="Type your message here..."
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    maxLength={255}
                />
                <Button className="h-full">
                    Send Message
                </Button>
            </form>
        </main>
    )
}

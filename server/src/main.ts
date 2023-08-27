import fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyIO from "fastify-socket.io";
import dotenv from "dotenv";
import closeWithGrace from "close-with-grace";

import { Redis } from "ioredis";
import { randomUUID } from "crypto";
dotenv.config();

const port = parseInt(process.env.PORT || '3001', 10);
const host = process.env.HOST || '0.0.0.0';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const REDIS_ENDPOINT = process.env.REDIS_ENDPOINT;

const CONNECTION_COUNT_KEY = "chat:connection-count"
const CONNECTION_COUNT_UPDATED_CHANNEL = "chat:connection-count-updated"
const NEW_MESSAGE_CHANNEL = "chat:new-message"

let connectedClients = 0;

if (!REDIS_ENDPOINT) {
    console.log("REDIS_ENDPOINT is not defined")
    process.exit(1)
}

const publisher = new Redis(REDIS_ENDPOINT);
const subscriber = new Redis(REDIS_ENDPOINT);

async function buildServer() {
    const app = fastify();

    await app.register(fastifyCors, {
        origin: CORS_ORIGIN
    });

    await app.register(fastifyIO);

    const currentCount = await publisher.get(CONNECTION_COUNT_KEY);
    if (!currentCount) await publisher.set(CONNECTION_COUNT_KEY, 0);

    app.io.on('connection', async (io) => {
        
        const incResult = await publisher.incr(CONNECTION_COUNT_KEY);
        await publisher.publish(CONNECTION_COUNT_UPDATED_CHANNEL, incResult.toString());
        connectedClients++;
        
        io.on("message", async (payload) => {

            if (!payload.message) return;

            await publisher.publish(NEW_MESSAGE_CHANNEL, payload.message.toString());
        });
        
        io.on('disconnect', async () => {
            const decResult = await publisher.decr(CONNECTION_COUNT_KEY);
            await publisher.publish(CONNECTION_COUNT_UPDATED_CHANNEL, decResult.toString());
            connectedClients--;
        });
    })

    subscriber.subscribe(CONNECTION_COUNT_UPDATED_CHANNEL, (err, count) => {
        if (err) {
            console.log(`Error subscribing to ${CONNECTION_COUNT_UPDATED_CHANNEL} ` +  err)
            return;
        }
        console.log(`${count} client connected to ${CONNECTION_COUNT_UPDATED_CHANNEL}`)
    });

    subscriber.subscribe(NEW_MESSAGE_CHANNEL, (err, count) => {
        if (err) {
            console.log(`Error subscribing to ${NEW_MESSAGE_CHANNEL} ` +  err)
            return;
        }

        console.log(`${count} client connected to ${NEW_MESSAGE_CHANNEL}`)
    });

    subscriber.on('message', (channel, text) => {
        if (channel == CONNECTION_COUNT_UPDATED_CHANNEL) {
            app.io.emit(CONNECTION_COUNT_UPDATED_CHANNEL, {
                count: text
            });

            return;
        }

        if (channel == NEW_MESSAGE_CHANNEL) {
            app.io.emit(NEW_MESSAGE_CHANNEL, {
                message: text,
                id: randomUUID(),
                createdAt: new Date(),
                port
            });

            return;
        }
    });

    app.get('/healthcheck', () => {
        return {
            status: "ok",
            port,
        }
    })

    return app;
}

async function main() {
    const app = await buildServer();

    try {
        await app.listen({port, host});

        closeWithGrace({delay: 2000}, async () => {

            if (connectedClients > 0) {
                const currentCount = parseInt(
                    ((await publisher.get(CONNECTION_COUNT_KEY)) || "0"),
                    10)
                ;
                const newCount = Math.max(currentCount - connectedClients, 0);
                await publisher.set(CONNECTION_COUNT_KEY, newCount);
            }

            await app.close();
        })
        console.log(`Server listening at http://${host}:${port}`)
    } catch(err) {
        console.log(err)
        process.exit(1)
    }
}

main();



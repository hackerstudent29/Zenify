import { FastifyInstance } from 'fastify';
import { billingController } from '../controllers/billing.controller';

export async function billingRoutes(fastify: FastifyInstance) {
    fastify.post('/checkout', {
        preHandler: [fastify.authenticate]
    }, billingController.createCheckoutSession);

    fastify.get('/verify', billingController.verifyPayment);
}

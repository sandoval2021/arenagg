import { createMiddleware } from 'hono/factory';import { createPrisma } from '../lib/prisma';import type { Env } from '../types/env';
export const dbMiddleware=createMiddleware<Env>(async(c,next)=>{const prisma=createPrisma(c.env);c.set('prisma',prisma);try{await next();}finally{await prisma.$disconnect();}});

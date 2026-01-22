import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
	port: parseInt(process.env.PORT_API || process.env.PORT || '3000', 10),
	secretToken: process.env.SECRET_TOKEN || 'default-secret-token',
	nodeEnv: process.env.NODE_ENV || 'development',
}));

console.log(`SERVER IS RUNNING ON PORT: ${process.env.PORT_API}`);
import express from 'express';
import cors from 'cors';
import userRoutes from './routes/userRoutes';
import costumerRoutes from './routes/clientRoutes';
import deliveryRoutes from './routes/deliveryRoutes';

const app = express();

app.use(cors());
app.use(express.json());

// Routes de usuarios
app.use('/api', userRoutes);
app.use('/api', costumerRoutes);
app.use('/api', deliveryRoutes);

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`🚀 O servidor está rodando na porta:  ${PORT}!`);
});

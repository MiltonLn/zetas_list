import { HashRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import NewList from './pages/NewList'
import GameDetail from './pages/GameDetail'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<NewList />} />
        <Route path="/game/:id" element={<GameDetail />} />
      </Routes>
    </HashRouter>
  )
}

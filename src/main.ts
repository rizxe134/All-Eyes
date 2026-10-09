import './styles.css'
import { boot } from './core/app'

const root = document.getElementById('app')
if (!root) throw new Error('missing app root')
boot(root)

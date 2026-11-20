import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@shared/services/user-preferences',()=>({getUserPreference:vi.fn(),setUserPreference:vi.fn()}))
import { getUserPreference,setUserPreference } from '@shared/services/user-preferences'
import { exportLouvorjaFromBrowser,importLouvorjaIntoBrowser } from '../louvorja-adapter'
import { normalizeLiturgyState } from '@modules/liturgy/services/liturgy-preferences'
beforeEach(()=>{localStorage.clear();vi.clearAllMocks()})
it('pacote completo preserva avulsas, horários e cadeados e conserva os dias legados',()=>{
 const state=normalizeLiturgyState({weekdays:{saturday:[{id:'m',type:'music',name:'Hino'}]},customLiturgies:[{id:'custom',name:'Especial',items:[],notes:'Equipe',startTime:'08:00',endTime:'09:00'}],deletionLocks:{'custom:custom':true}})
 vi.mocked(getUserPreference).mockImplementation((key:any)=>key==='liturgy.state.pt'?state:null)
 const pkg=exportLouvorjaFromBrowser('test','desktop')
 expect(pkg.entities.liturgy?.data.saturday).toBeDefined()
 expect(pkg.entities.liturgy?.data.state).toMatchObject({customLiturgies:[{name:'Especial'}],deletionLocks:{'custom:custom':true}})
})
it('importa estado completo do APK inclusive quando só há avulsas',()=>{
 const state=normalizeLiturgyState({customLiturgies:[{id:'custom',name:'Especial',items:[],notes:'Equipe'}]})
 vi.mocked(getUserPreference).mockReturnValue(null)
 const result=importLouvorjaIntoBrowser({schema:1,appVersion:'mobile',platform:'apk',exportedAt:'2026-11-12T00:00:00Z',entities:{liturgy:{type:'liturgy',modified:'2026-11-12T00:00:00Z',data:{state,locale:'pt'}}}})
 expect(result.applied).toContain('liturgy')
 expect(setUserPreference).toHaveBeenCalledWith('liturgy.state.pt',expect.objectContaining({customLiturgies:[expect.objectContaining({name:'Especial'})]}))
})

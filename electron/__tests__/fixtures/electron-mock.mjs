// Mock mínimo de 'electron' — palco-server usa app.getPath e ipcMain.on/handle.
export const app = { getPath: () => '/tmp/userData' }
export const ipcMain = {
  on: () => {},
  handle: () => {},
  removeListener: () => {},
  removeHandler: () => {},
}
export default { app, ipcMain }

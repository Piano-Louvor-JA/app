/** Perfil local exibido na Home (distrito + igreja). */
export interface HomeLocationProfile {
	district: string;
	church: string;
}

export const DEFAULT_HOME_LOCATION: HomeLocationProfile = {
	district: "",
	church: "",
};

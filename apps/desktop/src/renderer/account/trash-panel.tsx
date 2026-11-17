import {TrashPanel} from '../../../../../packages/account-ui/src/trash-panel.js';
import type {AccountClient} from '../../../../../packages/account-ui/src/client.js';
export function DesktopTrashPanel({client}:{client:AccountClient}){return <TrashPanel client={client}/>;}

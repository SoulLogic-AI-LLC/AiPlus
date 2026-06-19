import { createSignal, onMount, Show } from "solid-js"
import { useLocal } from "../context/local"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { useSDK } from "../context/sdk"
import { useProject } from "../context/project"

type AgentInfo = { name: string; description?: string; native?: boolean }

export function DialogAgent() {
  const local = useLocal()
  const dialog = useDialog()
  const toast = useToast()
  const sdk = useSDK()
  const project = useProject()

  // Fetch fresh agent list from server (picks up lease-based CEO lane changes)
  const [freshAgents, setFreshAgents] = createSignal<AgentInfo[] | null>(null)
  onMount(() => {
    const workspace = project.workspace.current()
    if (!workspace) return
    sdk.client.app
      .agents({ workspace }, { throwOnError: true })
      .then((res) => {
        if (res.data) setFreshAgents(res.data as AgentInfo[])
      })
      .catch(() => {})
  })

  const agents = () => freshAgents() ?? local.agent.list()

  const CEO_PATTERN = /^CEO(-\d)?$/
  const OCCUPIED_SUFFIX = " — currently in use"

  const options = () => {
    const list = agents()
    const ceoAgents = list.filter((a) => CEO_PATTERN.test(a.name))
    const allOccupied =
      ceoAgents.length > 0 && ceoAgents.every((a) => (a.description ?? "").includes("currently in use"))

    const items = list
      .filter((a) => !allOccupied || !CEO_PATTERN.test(a.name))
      .map((item) => {
        const isOccupied = (item.description ?? "").includes("currently in use")
        return {
          value: isOccupied ? "" : item.name,
          title: isOccupied ? `${item.name}${OCCUPIED_SUFFIX}` : item.name,
          description: item.native ? "native" : (item.description ?? "").replace(" — currently in use", ""),
          disabled: isOccupied,
        }
      })

    if (allOccupied) {
      items.unshift({
        value: "",
        title: "All CEO lanes in use (3/3)",
        description: "Close a CEO session to free a lane.",
        disabled: true,
      })
    }
    return items
  }

  return (
    <DialogSelect
      title="Select agent"
      current={local.agent.current()?.name}
      options={options()}
      onSelect={(option) => {
        if (!option.value) {
          toast.show({
            variant: "warning",
            message: "All CEO lanes in use (3/3). Close a CEO session to free a lane.",
            duration: 4000,
          })
          return
        }
        local.agent.set(option.value)
        dialog.clear()
      }}
    />
  )
}

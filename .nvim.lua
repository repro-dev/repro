local function get_worktrees()
  local output = vim.fn.system("reproctl wt list --json")
  if vim.v.shell_error ~= 0 then
    vim.notify("reproctl wt list --json failed: " .. output, vim.log.levels.ERROR)
    return {}
  end
  local ok, data = pcall(vim.json.decode, output)
  if not ok then
    vim.notify("Failed to parse worktree JSON", vim.log.levels.ERROR)
    return {}
  end
  return data
end

local function build_items()
  local worktrees = get_worktrees()
  local cwd = vim.fn.getcwd()
  local items = {}

  for _, wt in ipairs(worktrees) do
    if wt.bare then
      goto continue
    end

    local is_current = vim.fn.fnamemodify(cwd, ":p") == vim.fn.fnamemodify(wt.path, ":p")
    local branch_display = wt.branch or "(detached)"

    items[#items + 1] = {
      text = branch_display .. " " .. wt.slug .. " " .. wt.head,
      branch = branch_display,
      head = wt.head,
      slug = wt.slug,
      file = wt.path,
      services = wt.services or {},
      current = is_current,
    }

    ::continue::
  end

  return items
end

local function open_worktree_picker()
  local items = build_items()

  Snacks.picker({
    title = "Git Worktrees",
    items = items,
    format = function(item)
      local ret = {}

      if item.current then
        ret[#ret + 1] = { "* ", "DiagnosticOk", virtual = true }
      else
        ret[#ret + 1] = { "  ", virtual = true }
      end

      ret[#ret + 1] = { item.branch, item.current and "DiagnosticOk" or "SnacksPickerFile" }
      ret[#ret + 1] = { " ", virtual = true }
      ret[#ret + 1] = { item.head, "Comment", virtual = true }
      ret[#ret + 1] = { " ", virtual = true }
      ret[#ret + 1] = { item.slug, "SnacksPickerDir", virtual = true }

      if #item.services > 0 then
        ret[#ret + 1] = { " ", virtual = true }
        ret[#ret + 1] = { "[" .. table.concat(item.services, ", ") .. "]", "DiagnosticInfo", virtual = true }
      end

      return ret
    end,
    layout = {
      preset = "select",
    },
    confirm = function(picker, item)
      picker:close()
      if not item then
        return
      end
      if item.current then
        vim.notify("Already in worktree: " .. item.branch)
        return
      end

      local source_cwd = vim.fn.fnamemodify(vim.fn.getcwd(), ":p")
      local bufpath = vim.api.nvim_buf_get_name(0)
      local rel_file = nil

      if bufpath ~= "" and vim.startswith(bufpath, source_cwd) then
        rel_file = bufpath:sub(#source_cwd + 1)
      end

      vim.cmd("tcd " .. vim.fn.fnameescape(item.file))
      vim.cmd("clearjumps")

      local target_file = rel_file and (item.file .. "/" .. rel_file) or nil
      if target_file and vim.fn.filereadable(target_file) == 1 then
        vim.cmd("edit " .. vim.fn.fnameescape(target_file))
      else
        vim.cmd("edit .")
      end

      vim.notify("Switched to worktree: " .. item.branch)
    end,
    actions = {
      worktree_delete = function(picker)
        local item = picker:current()
        if not item then
          return
        end
        if item.current then
          vim.notify("Cannot delete the current worktree", vim.log.levels.WARN)
          return
        end
        if item.slug == "main" then
          vim.notify("Cannot delete the main worktree", vim.log.levels.WARN)
          return
        end
        picker:close()
        vim.notify("Removing worktree: " .. item.branch .. "...")
        vim.fn.system("reproctl wt remove " .. vim.fn.shellescape(item.branch))
        if vim.v.shell_error ~= 0 then
          vim.notify("Failed to remove worktree: " .. item.branch, vim.log.levels.ERROR)
        else
          vim.notify("Removed worktree: " .. item.branch)
        end
      end,
      worktree_create = function(picker)
        picker:close()
        vim.ui.input({ prompt = "Branch name: " }, function(branch)
          if not branch or branch == "" then
            return
          end
          vim.notify("Creating worktree: " .. branch .. "...")
          local output = vim.fn.system("reproctl wt create " .. vim.fn.shellescape(branch))
          if vim.v.shell_error ~= 0 then
            vim.notify("Failed to create worktree: " .. output, vim.log.levels.ERROR)
          else
            vim.notify("Created worktree: " .. branch)
          end
        end)
      end,
    },
    win = {
      input = {
        keys = {
          ["<C-x>"] = { "worktree_delete", mode = { "n", "i" }, desc = "Delete worktree" },
          ["<C-a>"] = { "worktree_create", mode = { "n", "i" }, desc = "Create worktree" },
        },
      },
    },
  })
end

vim.keymap.set("n", "<leader>gw", open_worktree_picker, { desc = "Git worktrees" })

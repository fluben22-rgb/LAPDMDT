local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

local ENDPOINT = "https://lgajaitgqqznzlzjazxn.supabase.co/functions/v1/gps"
local SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnYWphaXRncXF6bnpsemphenhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDg2NzQsImV4cCI6MjA4NTg4NDY3NH0.Sm_Y4XiwCwjVtdvNEALNsDNY4EDGVI2KIWXkp3VdmfQ"
local SECRET = "Update_Unit_Gps"
local UPDATE_SECONDS = 2

local function findPlayerCar(player)
	local vehiclesFolder = workspace:FindFirstChild("SUMMIT_VEHICLES")
	if not vehiclesFolder then
		return nil
	end

	return vehiclesFolder:FindFirstChild(player.Name .. "'s Car")
end

local function getCarPart(car)
	if car:IsA("BasePart") then
		return car
	end

	if car:IsA("Model") then
		return car.PrimaryPart or car:FindFirstChildWhichIsA("BasePart", true)
	end

	if car.FindFirstChildWhichIsA then
		return car:FindFirstChildWhichIsA("BasePart", true)
	end

	return nil
end

local function postUnitGps(player, part)
	local payload = {
		roblox_username = player.Name,
		x = part.Position.X,
		y = part.Position.Y,
		z = part.Position.Z,
		heading = part.Orientation.Y
	}

	local ok, response = pcall(function()
		return HttpService:RequestAsync({
			Url = ENDPOINT,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["Authorization"] = "Bearer " .. SUPABASE_ANON_KEY,
				["apikey"] = SUPABASE_ANON_KEY,
				["x-roblox-secret"] = SECRET
			},
			Body = HttpService:JSONEncode(payload)
		})
	end)

	if not ok then
		warn("Unit GPS request error:", response)
		return
	end

	if not response.Success then
		warn("Unit GPS request failed:", response.StatusCode, response.Body)
		return
	end

	local decoded
	local decodeOk = pcall(function()
		decoded = HttpService:JSONDecode(response.Body)
	end)

	if decodeOk and decoded and decoded.updated == 0 then
		warn("Unit GPS sent, but no MDT unit matched roblox_username:", player.Name)
	end
end

task.spawn(function()
	while true do
		for _, player in ipairs(Players:GetPlayers()) do
			local car = findPlayerCar(player)
			local part = car and getCarPart(car)
			if part then
				postUnitGps(player, part)
			end
		end

		task.wait(UPDATE_SECONDS)
	end
end)

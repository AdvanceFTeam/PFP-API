// This is Optional just for analytics and usage tracking
// This file is OPTIONAL - the API works perfectly fine without it
// To enable: Set SUPABASE_URL and SUPABASE_SERVICE_KEY in your .env file 

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
let analyticsEnabled = false;

if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    analyticsEnabled = true;
    console.log("Supabase analytics enabled");
  } catch (err) {
    console.warn("Supabase failed, analytics disabled:", err.message);
  }
} else {
  console.log("Supabase not configured - analytics disabled (API will work normally)");
}

async function log_api_usage(data) {
  if (!analyticsEnabled || !supabase) return;
  
  try {
    const { path, origin, referer, user_agent } = data;
    
    await supabase.from("api_usage_logs").insert({
      path,
      origin: origin || null,
      referer: referer || null,
      user_agent: user_agent || "unknown",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Failed to log API usage:", err.message);
  }
}

async function save_status_log(service_name, status, response_time, message = null) {
  if (!analyticsEnabled || !supabase) return;
  
  try {
    await supabase.from("service_status_logs").insert({
      service_name,
      status,
      response_time,
      message,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Failed to save status log:", err.message);
  }
}

async function get_service_uptime(service_name, hours = 24) {
  if (!analyticsEnabled || !supabase) return { uptime: 99.9, total_checks: 0 };
  
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from("service_status_logs")
      .select("status")
      .eq("service_name", service_name)
      .gte("timestamp", since);
    
    if (error) throw error;
    if (!data || data.length === 0) return { uptime: 99.9, total_checks: 0 };
    
    const operational = data.filter(log => log.status === "operational").length;
    const uptime = (operational / data.length) * 100;
    
    return { uptime: parseFloat(uptime.toFixed(2)), total_checks: data.length };
  } catch (err) {
    console.error("Failed to get service uptime:", err.message);
    return { uptime: 99.9, total_checks: 0 };
  }
}

async function get_service_incidents(service_name, days = 7) {
  if (!analyticsEnabled || !supabase) return [];
  
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from("service_status_logs")
      .select("*")
      .eq("service_name", service_name)
      .in("status", ["down", "degraded"])
      .gte("timestamp", since)
      .order("timestamp", { ascending: false })
      .limit(50);
    
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Failed to get service incidents:", err.message);
    return [];
  }
}

async function get_uptime_summary() {
  if (!analyticsEnabled || !supabase) return [];
  
  try {
    const services = [
      "Discord API Gateway",
      "GitHub API Gateway",
      "Image Processing Engine",
      "Cache & Rate Limiting"
    ];
    
    const summaries = await Promise.all(
      services.map(async (service_name) => {
        const uptime24h = await get_service_uptime(service_name, 24);
        const uptime7d = await get_service_uptime(service_name, 24 * 7);
        
        return {
          service_name,
          uptime_24h: uptime24h.uptime,
          uptime_7d: uptime7d.uptime,
          checks_24h: uptime24h.total_checks,
          checks_7d: uptime7d.total_checks
        };
      })
    );
    
    return summaries;
  } catch (err) {
    console.error("Failed to get uptime summary:", err.message);
    return [];
  }
}

async function get_all_service_statistics(days = 7) {
  if (!analyticsEnabled || !supabase) return [];
  
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from("service_status_logs")
      .select("service_name, status, response_time")
      .gte("timestamp", since);
    
    if (error) throw error;
    if (!data) return [];
    
    const serviceStats = {};
    
    data.forEach(log => {
      if (!serviceStats[log.service_name]) {
        serviceStats[log.service_name] = {
          total: 0,
          operational: 0,
          degraded: 0,
          down: 0,
          response_times: []
        };
      }
      
      serviceStats[log.service_name].total++;
      serviceStats[log.service_name][log.status]++;
      if (log.response_time) {
        serviceStats[log.service_name].response_times.push(log.response_time);
      }
    });
    
    return Object.entries(serviceStats).map(([service_name, stats]) => {
      const uptime_percentage = stats.total > 0 
        ? ((stats.operational / stats.total) * 100).toFixed(2)
        : "99.00";
      
      const avg_response_time = stats.response_times.length > 0
        ? Math.round(stats.response_times.reduce((a, b) => a + b, 0) / stats.response_times.length)
        : 0;
      
      return {
        service_name,
        uptime_percentage,
        avg_response_time,
        total_checks: stats.total,
        operational_count: stats.operational,
        degraded_count: stats.degraded,
        down_count: stats.down,
        incident_count: stats.degraded + stats.down
      };
    });
  } catch (err) {
    console.error("Failed to get service statistics:", err.message);
    return [];
  }
}

module.exports = {
  supabase,
  analyticsEnabled,
  log_api_usage,
  save_status_log,
  get_service_uptime,
  get_service_incidents,
  get_uptime_summary,
  get_all_service_statistics
};
